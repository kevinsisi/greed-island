import { randomBytes } from 'node:crypto'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'

type Player = { id: string; name: string; x: number; z: number; online: boolean }
type Obstacle = { x: number; z: number; width: number; depth: number }
type Snapshot = {
  tick: number
  selfId: string
  players: Player[]
  world: {
    minX: number
    maxX: number
    minZ: number
    maxZ: number
    playerRadius?: number
    movePerTick?: number
    obstacles: Obstacle[]
  }
}
type Point = { x: number; z: number }

const SCENE_ERROR = 'Default sandboxed Chromium could not start the WebGL scene; this test intentionally uses no unsafe browser flags.'

function credentials() {
  return {
    username: `e2e-${randomBytes(8).toString('hex')}`,
    password: `ci-only-${randomBytes(24).toString('base64url')}`,
  }
}

async function blockNonLoopback(context: BrowserContext): Promise<void> {
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    const localAppRequest = url.protocol === 'http:'
      && url.hostname === '127.0.0.1'
      && (url.port === '4178' || url.port === '4179')
    return localAppRequest ? route.continue() : route.abort()
  })
}

async function readSnapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(async () => {
    const response = await fetch('/mp-api/snapshot', { cache: 'no-store' })
    if (!response.ok) throw new Error('The local multiplayer snapshot was unavailable.')
    return response.json()
  }) as Promise<Snapshot>
}

async function fillPassword(page: Page, label: string, password: string): Promise<void> {
  try {
    await page.getByLabel(label, { exact: true }).fill(password)
  } catch {
    // Keep synthetic credentials out of Playwright's action error and reporter output.
    throw new Error('Could not fill a synthetic password field.')
  }
}

function selfPlayer(snapshot: Snapshot): Player {
  const self = snapshot.players.find(player => player.id === snapshot.selfId)
  if (!self) throw new Error('The local room snapshot omitted its own player.')
  return self
}

async function waitUntil(predicate: () => Promise<boolean>, timeoutMs = 8_000): Promise<void> {
  await expect.poll(predicate, { timeout: timeoutMs, intervals: [50, 100, 200] }).toBe(true)
}

async function register(page: Page, account: ReturnType<typeof credentials>): Promise<void> {
  await page.goto('/multiplayer-3d')
  await page.getByRole('button', { name: '申請帳號', exact: true }).click()
  await page.getByRole('textbox', { name: '帳號', exact: true }).fill(account.username)
  await fillPassword(page, '密碼', account.password)
  await fillPassword(page, '再次輸入密碼', account.password)
  await page.getByRole('button', { name: '建立帳號並進入 →', exact: true }).click()
  await expect(page.locator('.mp-connection')).toHaveText('房間已連線')
  await expect(page.locator('.mp-login-backdrop')).toHaveCount(0)
  await waitUntil(async () => {
    const errorCount = await page.locator('.mp-scene-error').count()
    const hasContext = await page.locator('canvas').evaluate(canvas => !!(canvas.getContext('webgl2') || canvas.getContext('webgl')))
    return errorCount > 0 || hasContext
  }, 20_000)
  await expect(page.locator('.mp-scene-loading')).toHaveCount(0, { timeout: 20_000 })
  const sceneError = page.locator('.mp-scene-error')
  if (await sceneError.count() > 0) {
    const detail = await sceneError.innerText()
    throw new Error(`${SCENE_ERROR} ${detail}`)
  }
}

async function login(page: Page, account: ReturnType<typeof credentials>): Promise<void> {
  await page.locator('.mp-logout').click()
  await expect(page.locator('.mp-login-backdrop')).toBeVisible()
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await page.getByRole('textbox', { name: '帳號', exact: true }).fill(account.username)
  await fillPassword(page, '密碼', account.password)
  await page.getByRole('button', { name: '進入共同港口 →', exact: true }).click()
  await expect(page.locator('.mp-connection')).toHaveText('房間已連線')
  await expect(page.locator('.mp-login-backdrop')).toHaveCount(0)
}

function assertSafePosition(snapshot: Snapshot): void {
  const self = selfPlayer(snapshot)
  const radius = snapshot.world.playerRadius ?? 0.35
  expect(self.x).toBeGreaterThanOrEqual(snapshot.world.minX + radius - 0.001)
  expect(self.x).toBeLessThanOrEqual(snapshot.world.maxX - radius + 0.001)
  expect(self.z).toBeGreaterThanOrEqual(snapshot.world.minZ + radius - 0.001)
  expect(self.z).toBeLessThanOrEqual(snapshot.world.maxZ - radius + 0.001)
  for (const obstacle of snapshot.world.obstacles) {
    const withinX = Math.abs(self.x - obstacle.x) < obstacle.width / 2 + radius - 0.001
    const withinZ = Math.abs(self.z - obstacle.z) < obstacle.depth / 2 + radius - 0.001
    expect(withinX && withinZ).toBe(false)
  }
}

function assertBoundedStep(before: Snapshot, after: Snapshot): void {
  const tickDelta = Math.max(1, after.tick - before.tick)
  const movePerTick = after.world.movePerTick ?? 0.4
  const beforePlayer = selfPlayer(before)
  const afterPlayer = selfPlayer(after)
  expect(Math.hypot(afterPlayer.x - beforePlayer.x, afterPlayer.z - beforePlayer.z))
    .toBeLessThanOrEqual(movePerTick * (tickDelta + 1) + 0.002)
  assertSafePosition(after)
}

/** Project a ground point through the untouched default camera, away from its occlusion ray. */
async function projectGroundPoint(page: Page, point: Point): Promise<{ x: number; y: number }> {
  return page.evaluate(async ({ x, z }) => {
    const canvas = document.querySelector('canvas')
    if (!canvas) throw new Error('The multiplayer scene canvas was missing.')
    const response = await fetch('/mp-api/snapshot', { cache: 'no-store' })
    if (!response.ok) throw new Error('The local multiplayer snapshot was unavailable.')
    const snapshot = await response.json()
    const self = snapshot.players.find((player: { id: string }) => player.id === snapshot.selfId)
    if (!self) throw new Error('The local room snapshot omitted its own player.')

    const pitch = 0.55
    // scene.ts uses DEFAULT_DISTANCE=8. The test never zooms or rotates; its route
    // targets keep the camera's ray behind the player clear of the two buildings.
    const distance = 8
    const targetY = 1.3
    const cameraX = self.x
    const cameraY = targetY + Math.sin(pitch) * distance
    const cameraZ = self.z - Math.cos(pitch) * distance
    const relativeX = x - cameraX
    const relativeY = -cameraY
    const relativeZ = z - cameraZ
    const depth = -relativeY * Math.sin(pitch) + relativeZ * Math.cos(pitch)
    const vertical = relativeY * Math.cos(pitch) + relativeZ * Math.sin(pitch)
    if (depth <= 0) throw new Error('The ground destination is behind the camera.')

    const rect = canvas.getBoundingClientRect()
    const focal = rect.height / (2 * Math.tan(0.9 / 2))
    const result = {
      x: rect.left + rect.width / 2 + relativeX * focal / depth,
      y: rect.top + rect.height / 2 - vertical * focal / depth,
    }
    const element = document.elementFromPoint(result.x, result.y)
    if (element !== canvas) throw new Error('The projected ground target is covered by a UI element.')
    return result
  }, point)
}

async function clickGroundPoint(page: Page, point: Point): Promise<void> {
  const before = await readSnapshot(page)
  const screenPoint = await projectGroundPoint(page, point)
  // This is a real Chromium pointer action on the canvas, not dispatchEvent or scene injection.
  await page.mouse.click(screenPoint.x, screenPoint.y)
  assertBoundedStep(before, await readSnapshot(page))
  await expect(page.locator('.mp-feedback')).toContainText('正在前往目的地。')
}

async function waitForArrival(page: Page, destination: Point, timeoutMs = 35_000): Promise<void> {
  let previous = await readSnapshot(page)
  assertSafePosition(previous)
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await page.waitForTimeout(50)
    const current = await readSnapshot(page)
    const after = selfPlayer(current)
    // The observed authoritative position may advance only by bounded server move intents.
    assertBoundedStep(previous, current)
    if (Math.hypot(after.x - destination.x, after.z - destination.z) <= 0.65) return
    previous = current
  }
  throw new Error('The server-authoritative player did not reach the requested ground destination in time.')
}

test('two synthetic accounts share the local room and use server-authoritative ground navigation', async ({ browser }) => {
  const accountA = credentials()
  const accountB = credentials()
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await Promise.all([blockNonLoopback(contextA), blockNonLoopback(contextB)])
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    await register(pageA, accountA)
    await login(pageA, accountA)
    await register(pageB, accountB)

    await expect(pageA.locator('.mp-players')).toContainText(accountB.username)
    await expect(pageB.locator('.mp-players')).toContainText(accountA.username)
    await waitUntil(async () => {
      const snapshot = await readSnapshot(pageA)
      return snapshot.players.some(player => player.name === accountB.username && player.online)
    })

    const message = `ci-shared-${randomBytes(8).toString('hex')}`
    await pageA.getByLabel('聊天訊息').fill(message)
    await pageA.getByRole('button', { name: '傳送', exact: true }).click()
    await expect(pageB.locator('.mp-messages')).toContainText(message)

    // Registrations share a safe but identical default spawn, so move B away before navigation.
    const beforeMoveB = selfPlayer(await readSnapshot(pageB))
    await pageB.locator('canvas').focus()
    await pageB.keyboard.down('ArrowRight')
    await pageB.waitForTimeout(800)
    await pageB.keyboard.up('ArrowRight')
    await waitUntil(async () => selfPlayer(await readSnapshot(pageB)).x >= beforeMoveB.x + 0.8)

    await clickGroundPoint(pageA, { x: 10, z: 13 })
    await waitForArrival(pageA, { x: 10, z: 13 })
    await expect(pageA.locator('.mp-feedback')).toContainText('已抵達目的地。')

    // A direction key is an ordinary manual input and must cancel the active click route.
    const cancellationTarget = { x: 10, z: 16 }
    await clickGroundPoint(pageA, cancellationTarget)
    const beforeCancel = selfPlayer(await readSnapshot(pageA))
    await waitUntil(async () => {
      const current = selfPlayer(await readSnapshot(pageA))
      return Math.hypot(current.x - beforeCancel.x, current.z - beforeCancel.z) > 0.1
    })
    await pageA.locator('canvas').focus()
    await pageA.keyboard.down('ArrowRight')
    await expect(pageA.locator('.mp-feedback')).toContainText('已切換手動移動，自動導航已取消。')
    await pageA.keyboard.up('ArrowRight')
    const afterManualRelease = selfPlayer(await readSnapshot(pageA))
    await pageA.waitForTimeout(250)
    const afterCancel = await readSnapshot(pageA)
    const afterCancelPlayer = selfPlayer(afterCancel)
    expect(Math.abs(afterCancelPlayer.z - afterManualRelease.z))
      .toBeLessThanOrEqual((afterCancel.world.movePerTick ?? 0.4) + 0.002)
    assertSafePosition(afterCancel)

    // Two rapid real pointer clicks should leave the newer destination as the active route.
    const firstRapidTarget = { x: 10.2, z: 16 }
    const latestRapidTarget = { x: 11, z: 16 }
    const beforeRapidClicks = await readSnapshot(pageA)
    const firstScreenPoint = await projectGroundPoint(pageA, firstRapidTarget)
    const latestScreenPoint = await projectGroundPoint(pageA, latestRapidTarget)
    await pageA.mouse.click(firstScreenPoint.x, firstScreenPoint.y)
    await pageA.mouse.click(latestScreenPoint.x, latestScreenPoint.y)
    assertBoundedStep(beforeRapidClicks, await readSnapshot(pageA))
    await expect(pageA.locator('.mp-feedback')).toContainText('正在前往目的地。')
    await waitForArrival(pageA, latestRapidTarget)
    await expect(pageA.locator('.mp-feedback')).toContainText('已抵達目的地。')
  } finally {
    await Promise.all([contextA.close(), contextB.close()])
  }
})
