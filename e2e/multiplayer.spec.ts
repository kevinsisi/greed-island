import { randomBytes } from 'node:crypto'
import { expect, test, type BrowserContext, type Page, type Request } from '@playwright/test'

type Point = { x: number; z: number }
type Player = Point & { accountId: number; online: boolean; tileId: string }
type Snapshot = {
  version: 1; selfId: number; tileId: string; revision: number; presenceRevision: number; movementStep: number; worldTick: number
  players: Player[]
  npcs: Array<{ id: string; location: string; activity: string }>
  messages: Array<{ id: string; accountId: number; tileId: string; text: string; sequence: number }>
  geometry: { minX: number; maxX: number; minZ: number; maxZ: number; playerRadius: number; movePerStep: number; obstacles: Array<Point & { width: number; depth: number }>; portals: Array<Point & { toTileId: string; radius: number }> }
  map: { regions: Array<{ id: string; available: boolean; geometrySupported: boolean }>; regionOnlineCounts: Record<string, number> }
}
async function withDeadline<T>(operation: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

type MovementRecord = { startedAt: number; dispatchGapMs: number | null; responseMs: number | null; status: number | null }

function percentile(values: readonly number[], ratio: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!)
}

/** Node-side timing for real movement dispatch/HTTP acknowledgements; never records bodies, cookies, or names. */
function trackMovementCommands(page: Page, markPhase: (phase: string) => void) {
  const records: MovementRecord[] = []
  const pending = new Map<Request, MovementRecord>()
  const onRequest = (request: Request) => {
    if (request.method() !== 'POST') return
    try { if (new URL(request.url()).pathname !== '/api/world/command') return } catch { return }
    try { if (request.postDataJSON()?.type !== 'move') return } catch { return }
    const startedAt = Date.now()
    const previous = records.at(-1)
    const record: MovementRecord = { startedAt, dispatchGapMs: previous ? startedAt - previous.startedAt : null, responseMs: null, status: null }
    records.push(record)
    pending.set(request, record)
  }
  const onResponse = (response: { request(): Request; status(): number }) => {
    const record = pending.get(response.request())
    if (!record) return
    record.responseMs = Date.now() - record.startedAt
    record.status = response.status()
    pending.delete(response.request())
    const completed = records.filter(item => item.responseMs !== null).length
    if (completed === 1 || completed % 10 === 0) markPhase(`movement-acks=${completed};latestAckMs=${record.responseMs};status=${record.status}`)
  }
  page.on('request', onRequest)
  page.on('response', onResponse)
  return {
    summary(): string {
      const gaps = records.flatMap(item => item.dispatchGapMs === null ? [] : [item.dispatchGapMs])
      const acks = records.flatMap(item => item.responseMs === null ? [] : [item.responseMs])
      const statuses = new Map<number, number>()
      for (const item of records) if (item.status !== null) statuses.set(item.status, (statuses.get(item.status) ?? 0) + 1)
      const stat = (values: readonly number[], ratio: number) => percentile(values, ratio)?.toString() ?? 'none'
      return `dispatches=${records.length},acks=${acks.length},pending=${pending.size},dispatchP50Ms=${stat(gaps, 0.5)},dispatchP95Ms=${stat(gaps, 0.95)},ackP50Ms=${stat(acks, 0.5)},ackP95Ms=${stat(acks, 0.95)},ackMaxMs=${acks.length ? Math.max(...acks) : 'none'},statuses=${[...statuses].map(([status, count]) => `${status}:${count}`).join(',') || 'none'}`
    },
    dispose(): void { page.off('request', onRequest); page.off('response', onResponse) },
  }
}

async function measureRenderCadence(page: Page): Promise<string> {
  return withDeadline(page.evaluate(async () => {
    const frames: number[] = []
    const start = performance.now()
    await new Promise<void>(resolve => {
      const sample = (timestamp: number) => {
        frames.push(timestamp)
        if (timestamp - start >= 1_200) resolve()
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    const intervals = frames.slice(1).map((timestamp, index) => timestamp - frames[index]!)
    const sorted = [...intervals].sort((a, b) => a - b)
    const at = (ratio: number) => sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!) : 'none'
    return { frames: frames.length, intervalP50Ms: at(0.5), intervalP95Ms: at(0.95) }
  }), 2_500, 'Render cadence sample').then(value => `frames=${value.frames},intervalP50Ms=${value.intervalP50Ms},intervalP95Ms=${value.intervalP95Ms}`)
    .catch(() => 'unavailable')
}

function credentials() { return { username: `e2e-${randomBytes(8).toString('hex')}`, password: `ci-only-${randomBytes(24).toString('base64url')}` } }
async function isolate(context: BrowserContext) {
  await context.route('**/*', route => {
    const url = new URL(route.request().url())
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && ['4178', '4179'].includes(url.port) ? route.continue() : route.abort()
  })
}
async function snapshot(page: Page): Promise<Snapshot> {
  return withDeadline(page.evaluate(async () => {
    const result = await fetch('/api/world/snapshot', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(5_000) })
    if (!result.ok) throw new Error('Disposable canonical snapshot unavailable.')
    return result.json()
  }) as Promise<Snapshot>, 7_000, 'Snapshot page evaluation')
}
async function probeSnapshotFromNode(page: Page): Promise<string> {
  const startedAt = Date.now()
  return withDeadline(
    page.context().request.get(new URL('/api/world/snapshot', page.url()).toString(), { timeout: 1_500 }),
    2_000,
    'Node-side snapshot probe',
  ).then(response => `status=${response.status()},elapsedMs=${Date.now() - startedAt}`)
    .catch(() => `unavailable,elapsedMs=${Date.now() - startedAt}`)
}

function self(state: Snapshot): Player {
  const player = state.players.find(p => p.accountId === state.selfId)
  if (!player) throw new Error('Canonical snapshot omitted self.')
  return player
}
async function field(page: Page, selector: string, value: string) {
  try { await page.locator(selector).fill(value) } catch { throw new Error('Could not fill a synthetic account field.') }
}
async function wait(predicate: () => Promise<boolean>, timeout = 10_000) { await expect.poll(predicate, { timeout, intervals: [100, 200] }).toBe(true) }
async function ready(page: Page) {
  await expect(page.locator('.mp-connection')).toHaveText('世界已連線', { timeout: 20_000 })
  await expect(page.locator('.mp-login-backdrop')).toHaveCount(0)
  await expect(page.locator('.mp-scene-loading')).toHaveCount(0, { timeout: 20_000 })
  await expect(page.locator('.mp-scene-error')).toHaveCount(0)
  expect(await page.locator('canvas').evaluate(canvas => canvas instanceof HTMLCanvasElement && !!(canvas.getContext('webgl2') || canvas.getContext('webgl')))).toBe(true)
  await page.waitForTimeout(250)
}
async function register(page: Page, account: ReturnType<typeof credentials>) {
  await page.goto('/game')
  await page.getByRole('button', { name: '申請帳號', exact: true }).click()
  await field(page, '#mp-username', account.username)
  await field(page, '#mp-password', account.password)
  await field(page, '#mp-confirm-password', account.password)
  await page.getByRole('button', { name: '建立帳號並進入 →', exact: true }).click()
  await ready(page)
}
async function login(page: Page, account: ReturnType<typeof credentials>) {
  await page.getByRole('button', { name: '登入', exact: true }).click()
  await field(page, '#mp-username', account.username)
  await field(page, '#mp-password', account.password)
  await page.getByRole('button', { name: '進入共同世界 →', exact: true }).click()
  await ready(page)
}
function safe(state: Snapshot) {
  const actor = self(state), g = state.geometry
  expect(actor.x).toBeGreaterThanOrEqual(g.minX + g.playerRadius - .001); expect(actor.x).toBeLessThanOrEqual(g.maxX - g.playerRadius + .001)
  expect(actor.z).toBeGreaterThanOrEqual(g.minZ + g.playerRadius - .001); expect(actor.z).toBeLessThanOrEqual(g.maxZ - g.playerRadius + .001)
  for (const o of g.obstacles) expect(Math.abs(actor.x - o.x) < o.width / 2 + g.playerRadius - .001 && Math.abs(actor.z - o.z) < o.depth / 2 + g.playerRadius - .001).toBe(false)
}
function bounded(before: Snapshot, after: Snapshot) {
  safe(after)
  if (before.tileId !== after.tileId) return
  const steps = Math.max(0, after.movementStep - before.movementStep)
  expect(Math.hypot(self(after).x - self(before).x, self(after).z - self(before).z)).toBeLessThanOrEqual(after.geometry.movePerStep * (steps + 1) + .002)
}
async function ground(page: Page, destination: Point) {
  await page.bringToFront()
  const point = await withDeadline(page.evaluate(async ({ x, z }) => {
    const canvas = document.querySelector('canvas')
    if (!canvas) throw new Error('Canonical canvas missing.')
    const response = await fetch('/api/world/snapshot', { credentials: 'include', cache: 'no-store' })
    if (!response.ok) throw new Error('Canonical snapshot unavailable.')
    const state = await response.json(), actor = state.players.find((p: { accountId: number }) => p.accountId === state.selfId)
    if (!actor) throw new Error('Canonical self missing.')
    const pitch = .55, distance = 8, cameraY = 1.3 + Math.sin(pitch) * distance
    const rx = x - actor.x, ry = -cameraY, rz = z - (actor.z - Math.cos(pitch) * distance)
    const depth = -ry * Math.sin(pitch) + rz * Math.cos(pitch), vertical = ry * Math.cos(pitch) + rz * Math.sin(pitch)
    if (depth <= 0) throw new Error('Ground target is behind the untouched camera.')
    const rect = canvas.getBoundingClientRect(), focal = rect.height / (2 * Math.tan(.9 / 2))
    const result = { x: rect.left + rect.width / 2 + rx * focal / depth, y: rect.top + rect.height / 2 - vertical * focal / depth }
    if (document.elementFromPoint(result.x, result.y) !== canvas) throw new Error('Ground target covered by UI.')
    return result
  }, destination), 7_000, 'Ground projection')
  await page.mouse.click(point.x, point.y)
}
async function arrive(page: Page, destination: Point, timeout = 35_000) {
  let previous = await snapshot(page)
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    await page.waitForTimeout(100)
    const current = await snapshot(page); bounded(previous, current)
    if (Math.hypot(self(current).x - destination.x, self(current).z - destination.z) <= .65) { await page.waitForTimeout(250); return }
    previous = current
  }
  throw new Error('Bounded server-authoritative destination deadline expired.')
}
async function phase(name: string, operation: () => Promise<void>) {
  const started = Date.now()
  console.log(`[multiplayer-e2e] ${name} started`)
  try { await test.step(name, operation) } catch { throw new Error(`Canonical UI phase failed: ${name}; elapsed ${Date.now() - started}ms. No synthetic credentials or payloads retained.`) }
  finally { console.log(`[multiplayer-e2e] ${name} elapsedMs=${Date.now() - started}`) }
}

test('one cookie world preserves normal signup, chat, navigation and canonical crossings', async ({ browser }) => {
  const accountA = credentials(), accountB = credentials()
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } }), contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await Promise.all([isolate(contextA), isolate(contextB)])
  const pageA = await contextA.newPage(), pageB = await contextB.newPage()
  const testStartedAt = Date.now()
  const markPhase = (message: string) => console.log(`[multiplayer-e2e] ${message} elapsedMs=${Date.now() - testStartedAt}`)
  const movementA = trackMovementCommands(pageA, markPhase), movementB = trackMovementCommands(pageB, markPhase)
  let forbiddenLegacyRequest = false, transitions = 0
  pageA.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/mp-api')) forbiddenLegacyRequest = true
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/world/command') {
      try { if (request.postDataJSON()?.type === 'transition') transitions += 1 } catch { /* no payload diagnostics */ }
    }
  })
  try {
    await phase('normal registration and original-credential login', async () => {
      await register(pageA, accountA)
      await pageA.locator('.mp-logout').click(); await expect(pageA.locator('.mp-login-backdrop')).toBeVisible()
      await login(pageA, accountA); await register(pageB, accountB)
    })
    const idA = (await snapshot(pageA)).selfId, idB = (await snapshot(pageB)).selfId
    await phase('same-region peer and canonical NPC projection', async () => {
      await wait(async () => (await snapshot(pageA)).players.some(p => p.accountId === idB && p.online))
      await wait(async () => (await snapshot(pageB)).players.some(p => p.accountId === idA && p.online))
      const state = await snapshot(pageA)
      expect(state.npcs.every(n => n.location === state.tileId && n.activity !== 'move')).toBe(true)
      await wait(async () => await pageA.locator('.mp-npcs li strong').count() === (await snapshot(pageA)).npcs.length)
      // Other tests use fresh accounts on this same serial fixture server. Wait for
      // their closed contexts' stream presence to settle before the exact count.
      await wait(async () => {
        const current = await snapshot(pageA)
        return current.map.regionOnlineCounts[current.tileId] === 2
      })
      const tab = await contextA.newPage(); await tab.goto('/game'); await ready(tab)
      const duplicate = await snapshot(tab)
      expect(duplicate.players.filter(p => p.accountId === idA).length).toBe(1)
      expect(duplicate.map.regionOnlineCounts[duplicate.tileId]).toBe(2)
      await tab.close()
    })
    await phase('public escaped world chat and input-focus safety', async () => {
      const before = self(await snapshot(pageA))
      await field(pageA, '#world-chat', 'WASD <script>plain text</script>')
      await pageA.getByRole('button', { name: '傳送', exact: true }).click()
      await wait(async () => (await snapshot(pageB)).messages.some(m => m.accountId === idA && m.text === 'WASD <script>plain text</script>'))
      expect(await pageA.locator('.mp-messages script').count()).toBe(0)
      const after = self(await snapshot(pageA)); expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(.05)
    })
    await phase('real canvas arrival, retargeting and keyboard cancellation', async () => {
      await ground(pageA, { x: 4, z: -2 }); await arrive(pageA, { x: 4, z: -2 })
      await ground(pageA, { x: 4, z: 6 }); await pageA.waitForTimeout(150)
      await ground(pageA, { x: 0, z: 0 }); await arrive(pageA, { x: 0, z: 0 })
      await ground(pageA, { x: 0, z: 8 }); await pageA.locator('canvas').focus(); await pageA.keyboard.down('ArrowRight'); await pageA.waitForTimeout(250); await pageA.keyboard.up('ArrowRight')
      await expect(pageA.locator('.mp-feedback')).toContainText('取消')
      const stop = await snapshot(pageA); await pageA.waitForTimeout(400); bounded(stop, await snapshot(pageA))
      expect(Math.abs(self(await snapshot(pageA)).z - self(stop).z)).toBeLessThan(.5)
    })
    await phase('locked or unsupported map selections fail closed', async () => {
      const state = await snapshot(pageA), locked = state.map.regions.find(r => !r.available || !r.geometrySupported)
      if (!locked) throw new Error('Disposable world omitted its locked/unsupported map states.')
      const count = transitions
      await pageA.locator('#world-region').selectOption(locked.id)
      await expect(pageA.locator('.mp-actions .mp-primary')).toBeDisabled()
      await pageA.waitForTimeout(200); expect(transitions).toBe(count)
      await pageA.locator('#world-region').selectOption('t_dock')
    })
    await phase('ordinary crossing to central rebuilds the same world region', async () => {
      for (const destination of [{ x: 0, z: 2 }, { x: 0, z: 10 }, { x: 0, z: 16 }]) { await ground(pageA, destination); await arrive(pageA, destination) }
      await pageA.locator('#world-region').selectOption('t_central')
      const cross = pageA.locator('.mp-actions .mp-primary'); await expect(cross).toBeEnabled(); await cross.click()
      await wait(async () => (await snapshot(pageA)).tileId === 't_central')
      await expect(pageA.locator('.mp-mission h1')).toHaveText('夜潮區')
      expect((await snapshot(pageA)).npcs.every(n => n.location === 't_central')).toBe(true)
      await field(pageA, '#world-chat', 'cross-region-world-message'); await pageA.getByRole('button', { name: '傳送', exact: true }).click()
      await wait(async () => (await snapshot(pageB)).messages.some(m => m.accountId === idA && m.tileId === 't_central' && m.text === 'cross-region-world-message'))
    })
    expect(forbiddenLegacyRequest).toBe(false)
    expect(await pageA.evaluate(() => localStorage.getItem('gi.auth.token'))).toBeNull()
  } finally {
    const [probeA, probeB, cadenceA, cadenceB] = await Promise.all([probeSnapshotFromNode(pageA), probeSnapshotFromNode(pageB), measureRenderCadence(pageA), measureRenderCadence(pageB)])
    markPhase(`A movement=${movementA.summary()};nodeSnapshotProbe=${probeA};renderCadence=${cadenceA}`)
    markPhase(`B movement=${movementB.summary()};nodeSnapshotProbe=${probeB};renderCadence=${cadenceB}`)
    movementA.dispose(); movementB.dispose()
    await Promise.all([contextA.close(), contextB.close()])
  }
})

// Independent of the earlier journey: seed through the real UI, never reuse another
// test's account/session. The one-worker config keeps shared-fixture counts serial.
test('shared-cookie account switch invalidates stale tab identity', async ({ browser }) => {
  const accountA = credentials(), accountB = credentials()
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } }), contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  try {
    await Promise.all([isolate(contextA), isolate(contextB)])
    const pageA = await contextA.newPage(), pageB = await contextB.newPage()
    let forbiddenLegacyRequest = false
    for (const page of [pageA, pageB]) page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/mp-api')) forbiddenLegacyRequest = true
    })
    await phase('fresh UI registration for shared-cookie identity isolation', async () => {
      await register(pageA, accountA); await register(pageB, accountB)
    })
    const idA = (await snapshot(pageA)).selfId, idB = (await snapshot(pageB)).selfId
    expect(idA).not.toBe(idB)
    await phase('independent identity setup crosses from dock to central', async () => {
      expect((await snapshot(pageA)).tileId).toBe('t_dock')
      // Fresh dock spawn is (0, -6); these unobstructed <=8-unit legs use
      // the same real canvas path and unchanged per-arrival deadline.
      for (const destination of [{ x: 0, z: 2 }, { x: 0, z: 10 }, { x: 0, z: 16 }]) { await ground(pageA, destination); await arrive(pageA, destination) }
      await pageA.locator('#world-region').selectOption('t_central')
      const cross = pageA.locator('.mp-actions .mp-primary'); await expect(cross).toBeEnabled(); await cross.click()
      await wait(async () => (await snapshot(pageA)).tileId === 't_central')
      await expect(pageA.locator('.mp-mission h1')).toHaveText('夜潮區')
      expect((await snapshot(pageA)).selfId).toBe(idA)
      expect((await snapshot(pageB)).tileId).toBe('t_dock')
    })
    await phase('shared-cookie account switch invalidates stale tab identity', async () => {
      const tab = await contextA.newPage(); await tab.goto('/game'); await ready(tab)
      await tab.locator('.mp-logout').click(); await expect(tab.locator('.mp-login-backdrop')).toBeVisible()
      await login(tab, accountB)
      await wait(async () => (await snapshot(pageA)).selfId === idB)
      await wait(async () => (await pageA.locator('.mp-self').innerText()).includes(`#${idB}`))
      await ready(pageA)
      expect((await snapshot(pageA)).players.filter(p => p.accountId === idB).length).toBe(1)
      const switched = await snapshot(pageA), peer = await snapshot(pageB)
      expect(switched.tileId).toBe('t_dock')
      expect(switched.geometry).toEqual(peer.geometry)
      await expect(pageA.locator('.mp-mission h1')).toHaveText('碼頭區')
      await expect(pageA.locator('#world-region')).toHaveValue('t_dock')
      await tab.close()
    })
    expect(forbiddenLegacyRequest).toBe(false)
    expect(await pageA.evaluate(() => localStorage.getItem('gi.auth.token'))).toBeNull()
  } finally {
    await Promise.all([contextA.close(), contextB.close()])
  }
})
