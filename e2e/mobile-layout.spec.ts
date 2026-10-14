import { randomBytes } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const sizes = [
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '393x852', width: 393, height: 852 },
  { name: '430x932', width: 430, height: 932 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
]

async function register(page: Page) {
  const account = process.env.MOBILE_QA_ACCOUNT || `layout-${randomBytes(8).toString('hex')}`
  const password = process.env.MOBILE_QA_PASSWORD || `layout-only-${randomBytes(20).toString('base64url')}`
  await page.goto('/game')
  if (!process.env.MOBILE_QA_ACCOUNT) await page.getByRole('button', { name: '申請帳號', exact: true }).click()
  await page.locator('#mp-username').fill(account)
  await page.locator('#mp-password').fill(password)
  if (!process.env.MOBILE_QA_ACCOUNT) {
    await page.locator('#mp-confirm-password').fill(password)
    await page.getByRole('button', { name: '建立帳號並進入 →', exact: true }).click()
  } else await page.getByRole('button', { name: '進入共同世界 →', exact: true }).click()
  await expect(page.locator('.mp-connection')).toHaveText('世界已連線', { timeout: 20_000 })
  await expect(page.locator('.mp-scene-loading')).toHaveCount(0, { timeout: 20_000 })
}

test('game layout stays within viewport and the region choice fits at phone, tablet, and desktop sizes', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  try {
    await register(page)
    await expect(page.getByRole('textbox', { name: '世界聊天訊息' })).toBeVisible()
    await expect(page.getByRole('button', { name: '傳送', exact: true })).toBeVisible()
    for (const size of sizes) {
      await test.step(`${size.name} viewport`, async () => {
        await page.setViewportSize({ width: size.width, height: size.height })
        await page.waitForTimeout(150)
        if (size.width < 768) await page.getByRole('button', { name: '共同世界地圖' }).click()
        const result = await page.locator('#world-region').evaluate(select => {
          const option = select.selectedOptions[0]
          const style = getComputedStyle(select)
          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d')!
          context.font = `${style.fontSize} ${style.fontFamily}`
          const requiredTextWidth = context.measureText(option?.textContent ?? '').width
          const availableTextWidth = select.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 30
          return {
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            selectWidth: select.clientWidth,
            optionText: option?.textContent ?? '',
            requiredTextWidth,
            availableTextWidth,
            selectorHasClippingStyles: style.textOverflow === 'ellipsis' || style.overflow === 'hidden' && style.whiteSpace === 'nowrap',
          }
        })
        expect(result.scrollWidth, `${size.name}: document scrollWidth`).toBeLessThanOrEqual(result.viewportWidth)
        expect(result.selectWidth, `${size.name}: region selector is visible`).toBeGreaterThan(0)
        expect(result.requiredTextWidth, `${size.name}: selected label fits: ${result.optionText}`).toBeLessThanOrEqual(result.availableTextWidth)
        expect(result.selectorHasClippingStyles, `${size.name}: selector must not ellipsize`).toBe(false)
        const path = testInfo.outputPath(`game-${size.name}.png`)
        await page.screenshot({ path, fullPage: false })
        if (size.width < 768) await page.locator('.mp-drawer-scrim').click({ position: { x: 1, y: 35 } })
        console.log(`[mobile-layout-e2e] viewport=${size.name} scrollWidth=${result.scrollWidth} viewportWidth=${result.viewportWidth} selector=${result.selectWidth}px labelWidth=${result.requiredTextWidth.toFixed(1)}/${result.availableTextWidth.toFixed(1)} screenshot=${path}`)
      })
    }
  } finally {
    await context.close()
  }
})

test('desktop 1280x800 keeps reset text and places the region selector below the map image', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await register(page)
  const reset = page.getByRole('button', { name: '重置鏡頭' })
  await expect(reset).toBeVisible()
  expect(await reset.evaluate(button => button.innerText)).toContain('重置鏡頭')
  const geometry = await page.evaluate(() => {
    const map = document.querySelector('.mp-map svg')!.getBoundingClientRect()
    const select = document.querySelector('#world-region')!.getBoundingClientRect()
    const panel = document.querySelector('.mp-world-panel')!
    const overlapWidth = Math.max(0, Math.min(map.right, select.right) - Math.max(map.left, select.left))
    const overlapHeight = Math.max(0, Math.min(map.bottom, select.bottom) - Math.max(map.top, select.top))
    const scrollChains = ['.mp-players', '.mp-npcs', '.mp-messages'].map(selector => {
      const list = panel.querySelector(selector)!
      const overflow = []
      for (let node: Element | null = list; node && panel.contains(node); node = node.parentElement) {
        const value = getComputedStyle(node).overflowY
        if (value === 'auto' || value === 'scroll') overflow.push(`${node.className}:${value}`)
        if (node === panel) break
      }
      return { selector, count: overflow.length, overflow }
    })
    return { map: { left: map.left, top: map.top, right: map.right, bottom: map.bottom }, select: { left: select.left, top: select.top, right: select.right, bottom: select.bottom }, overlapArea: overlapWidth * overlapHeight, scrollChains }
  })
  expect(geometry.overlapArea, `map ${JSON.stringify(geometry.map)} / selector ${JSON.stringify(geometry.select)}`).toBe(0)
  expect(geometry.scrollChains, 'each desktop list has exactly one scrollable ancestor chain').toEqual([
    { selector: '.mp-players', count: 1, overflow: ['mp-players:auto'] },
    { selector: '.mp-npcs', count: 1, overflow: ['mp-npcs:auto'] },
    { selector: '.mp-messages', count: 1, overflow: ['mp-messages:auto'] },
  ])
  console.log(`[mobile-layout] desktop-reset visibleText=${await reset.evaluate(button => button.innerText)} mapBottom=${geometry.map.bottom.toFixed(1)} selectorTop=${geometry.select.top.toFixed(1)} overlap=${geometry.overlapArea} scrollChainCounts=${geometry.scrollChains.map(chain => `${chain.selector}:${chain.count}`).join(',')}`)
})

test('mobile bottom tool buttons show two-character labels without clipping at 375, 393 and 430px', async ({ page }) => {
  await mobilePage(page)
  const expected = ['說明', '地圖', '點燈', '旅人', '帳號']
  for (const size of sizes.filter(item => [375, 393, 430].includes(item.width))) {
    await page.setViewportSize({ width: size.width, height: size.height })
    const buttons = await page.locator('.mp-mobile-tools button').evaluateAll(elements => elements.map(button => {
      const label = button.querySelector<HTMLElement>('.mp-tool-label')!
      const style = getComputedStyle(label)
      const rect = button.getBoundingClientRect()
      return { label: label.innerText, fontSize: parseFloat(style.fontSize), whiteSpace: style.whiteSpace, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth, height: rect.height }
    }))
    expect(buttons.map(button => button.label)).toEqual(expected)
    for (const [index, button] of buttons.entries()) {
      expect([...button.label].length, `${size.name} tool ${index} label length`).toBe(2)
      expect(button.fontSize, `${size.name} tool ${button.label} font size`).toBeGreaterThanOrEqual(12)
      expect(button.whiteSpace, `${size.name} tool ${button.label} no-wrap`).toBe('nowrap')
      expect(button.scrollWidth, `${size.name} tool ${button.label} unclipped`).toBeLessThanOrEqual(button.clientWidth)
      expect(button.height, `${size.name} tool ${button.label} touch height`).toBeGreaterThanOrEqual(44)
    }
    console.log(`[mobile-layout] tool-labels size=${size.name} labels=${buttons.map(button => button.label).join('/')} font=${Math.min(...buttons.map(button => button.fontSize))}px minHeight=${Math.min(...buttons.map(button => button.height))}px maxScroll=${Math.max(...buttons.map(button => button.scrollWidth - button.clientWidth))}`)
  }
})

test('mobile traveller drawer keeps the first NPC row fully inside the scroll viewport', async ({ page }) => {
  await mobilePage(page)
  await page.getByRole('button', { name: '旅人與 NPC' }).click()
  const firstNpc = page.locator('.mp-npcs li').first()
  await expect(firstNpc).toBeVisible()
  const boxes = await page.evaluate(() => {
    const row = document.querySelector('.mp-npcs li')!.getBoundingClientRect()
    const list = document.querySelector('.mp-npcs')!.getBoundingClientRect()
    const drawer = document.querySelector('.mp-mobile-drawer')!.getBoundingClientRect()
    return { rowTop: row.top, rowBottom: row.bottom, listTop: list.top, listBottom: list.bottom, drawerTop: drawer.top, drawerBottom: drawer.bottom, firstNpc: document.querySelector('.mp-npcs li')!.textContent?.trim() }
  })
  expect(boxes.rowTop, `first NPC row ${boxes.firstNpc} starts below drawer top`).toBeGreaterThanOrEqual(boxes.drawerTop)
  expect(boxes.rowTop, `first NPC row ${boxes.firstNpc} starts at list row boundary`).toBeGreaterThanOrEqual(boxes.listTop)
  expect(boxes.rowBottom, `first NPC row ${boxes.firstNpc} is fully visible in list`).toBeLessThanOrEqual(boxes.listBottom)
  expect(boxes.rowBottom, `first NPC row ${boxes.firstNpc} is fully visible in drawer`).toBeLessThanOrEqual(boxes.drawerBottom)
  await saveEvidence(page, 'f-mobile-first-npc-row.png')
  console.log(`[mobile-layout] first-npc row=${boxes.firstNpc} top=${boxes.rowTop.toFixed(1)} bottom=${boxes.rowBottom.toFixed(1)} list=${boxes.listTop.toFixed(1)}..${boxes.listBottom.toFixed(1)} drawer=${boxes.drawerTop.toFixed(1)}..${boxes.drawerBottom.toFixed(1)}`)
})

async function mobilePage(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 })
  await register(page)
}

async function canvasVisibleRatio(page: Page) {
  return page.locator('.mp-canvas').evaluate(canvas => {
    const { width, height } = canvas.getBoundingClientRect()
    const blockers = ['.mp-header', '.mp-mobile-tools', '.mp-mobile-drawer[data-open="true"]', '.mp-menu-drawer', '.mp-stick', '.mp-camera-reset'].flatMap(selector => [...document.querySelectorAll(selector)].map(el => ({ rect: el.getBoundingClientRect(), display: getComputedStyle(el).display })).filter(item => item.rect.width && item.rect.height && item.display !== 'none').map(item => item.rect))
    let visible = 0, total = 0
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
      const px = (x + .5) * width / 20, py = (y + .5) * height / 20
      total++
      if (!blockers.some(rect => px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom)) visible++
    }
    return visible / total
  })
}

async function saveEvidence(page: Page, name: string) {
  const path = resolve('packages/web/evidence/mobile-layout', name)
  await mkdir(resolve(path, '..'), { recursive: true })
  await page.screenshot({ path, fullPage: false })
  return path
}

async function steerJoystick(page: Page, horizontal: number, vertical: number, durationMs: number) {
  const rect = await page.locator('.mp-stick').boundingBox()
  if (!rect) throw new Error('Joystick is not visible.')
  const start = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const target = {
    x: start.x + Math.max(-1, Math.min(1, horizontal)) * (rect.width / 2 - 5),
    y: start.y - Math.max(-1, Math.min(1, vertical)) * (rect.height / 2 - 5),
  }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 6 })
  await page.waitForTimeout(durationMs)
  await page.mouse.up()
  await page.waitForTimeout(250)
}

async function readAccountPosition(page: Page) {
  await page.getByRole('button', { name: '帳號卡' }).click()
  const text = await page.locator('.mp-account-drawer p').textContent()
  await page.getByRole('button', { name: '帳號卡' }).click()
  const match = text?.match(/帳號 #(\d+) · (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)/)
  if (!match) throw new Error(`Could not read account position: ${text}`)
  const tileId = await page.evaluate(async () => {
    const response = await fetch('/api/world/snapshot')
    const world = await response.json()
    return world.tileId as string
  })
  return { accountId: Number(match[1]), x: Number(match[2]), z: Number(match[3]), tileId, text }
}

async function readServerPosition(page: Page) {
  return page.evaluate(async () => {
    const response = await fetch('/api/world/snapshot')
    const world = await response.json()
    const self = world.players.find((player: { accountId: number }) => player.accountId === world.selfId)
    return { x: self.x as number, z: self.z as number, tileId: world.tileId as string }
  })
}

async function holdJoystickUntil(page: Page, axis: 'x' | 'z', targetValue: number, tolerance = .15) {
  const initial = await readServerPosition(page)
  if (Math.abs(initial[axis] - targetValue) <= tolerance) return initial
  const direction = Math.sign(targetValue - initial[axis])
  const rect = await page.locator('.mp-stick').boundingBox()
  if (!rect) throw new Error('Joystick is not visible.')
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  const target = {
    x: center.x + (axis === 'x' ? direction : 0) * (rect.width / 2 - 5),
    y: center.y - (axis === 'z' ? direction : 0) * (rect.height / 2 - 5),
  }
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  try {
    await page.mouse.move(target.x, target.y)
    let position = initial
    for (let elapsed = 0; elapsed < 15_000; elapsed += 150) {
      await page.waitForTimeout(150)
      position = await readServerPosition(page)
      if (direction > 0 ? position[axis] >= targetValue - tolerance : position[axis] <= targetValue + tolerance) return position
    }
    throw new Error(`Joystick missed ${axis}=${targetValue}; last position=${JSON.stringify(position)}`)
  } finally {
    await page.mouse.up()
    await page.waitForTimeout(350)
  }
}

async function canvasPixelMetrics(page: Page) {
  // Hide DOM overlays only during capture so the screenshot measures the actual WebGL canvas.
  const overlayMask = await page.addStyleTag({ content: '.mp3d > :not(.mp-canvas){visibility:hidden!important}' })
  const png = await page.locator('.mp-canvas').screenshot({ animations: 'disabled' })
  await overlayMask.evaluate(element => element.remove())
  return page.evaluate(async encoded => {
    const image = new Image()
    image.src = `data:image/png;base64,${encoded}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    const left = Math.floor(canvas.width * .32), right = Math.ceil(canvas.width * .68)
    const top = Math.floor(canvas.height * .08), bottom = Math.floor(canvas.height * .86)
    const colors = new Set<string>()
    let highEdges = 0, comparisons = 0
    const luminance = (x: number, y: number) => {
      const i = (y * canvas.width + x) * 4
      return .2126 * pixels[i]! + .7152 * pixels[i + 1]! + .0722 * pixels[i + 2]!
    }
    for (let y = top; y < bottom; y += 2) for (let x = left; x < right; x += 2) {
      const i = (y * canvas.width + x) * 4
      colors.add(`${pixels[i]! >> 4},${pixels[i + 1]! >> 4},${pixels[i + 2]! >> 4}`)
      if (x + 2 < right) { if (Math.abs(luminance(x + 2, y) - luminance(x, y)) > 20) highEdges++; comparisons++ }
      if (y + 2 < bottom) { if (Math.abs(luminance(x, y + 2) - luminance(x, y)) > 20) highEdges++; comparisons++ }
    }
    return { width: canvas.width, height: canvas.height, quantizedColors: colors.size, highEdges, comparisons, edgeRatio: highEdges / comparisons }
  }, png.toString('base64'))
}

async function auditMobileUi(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
    const rgb = (value: string) => {
      const values = value.match(/[\d.]+/g)?.map(Number)
      return values && values.length >= 3 ? [values[0]!, values[1]!, values[2]!, values[3] ?? 1] as const : null
    }
    const composite = (front: readonly number[], back: readonly number[]) => front.map((value, index) => value * front[3]! + back[index]! * (1 - front[3]!))
    const luminance = (color: readonly number[]) => {
      const channel = (value: number) => { const c = value / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 }
      return .2126 * channel(color[0]!) + .7152 * channel(color[1]!) + .0722 * channel(color[2]!)
    }
    const root = document.querySelector('.mp3d')
    const textElements = [...document.querySelectorAll('body *')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim()))
    const lowContrast = textElements.flatMap(el => {
      const chain: Element[] = []
      for (let node: Element | null = el; node; node = node.parentElement) { chain.push(node); if (node === root) break }
      chain.reverse()
      let background = [20, 59, 54, 1]
      let opacity = 1
      for (const node of chain) {
        const style = getComputedStyle(node)
        const layer = rgb(style.backgroundColor)
        if (layer) background = composite(layer, background)
        opacity *= Number(style.opacity)
      }
      const foreground = rgb(getComputedStyle(el).color)
      if (!foreground) return []
      const effective = composite([foreground[0]!, foreground[1]!, foreground[2]!, foreground[3]! * opacity], background)
      const values = [luminance(effective), luminance(background)].sort((a, b) => b - a)
      const ratio = (values[0]! + .05) / (values[1]! + .05)
      return ratio < 4.5 ? [{ text: el.textContent?.trim().slice(0, 30), ratio: Number(ratio.toFixed(2)) }] : []
    })
    const buttons = [...document.querySelectorAll('button')].filter(visible)
    const misses = buttons.flatMap(button => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === button && r.width >= 44 && r.height >= 44 ? [] : [button.textContent?.trim() || button.getAttribute('aria-label') || 'unnamed'] })
    const smallText = textElements.flatMap(el => { const size = parseFloat(getComputedStyle(el).fontSize); const minimum = el.classList.contains('mp-tool-label') ? 12 : 14; return size < minimum && !el.closest('.mp-authority,.mp-progress-note,.mp-controls-hint') ? [{ text: el.textContent?.trim().slice(0, 32), size }] : [] })
    return { misses, smallText, lowContrast }
  })
}

test('mobile scene stays exposed with every drawer closed or open at 375, 393 and 430px', async ({ page }, testInfo) => {
  await mobilePage(page)
  for (const size of sizes.filter(item => item.width < 768)) {
    await page.setViewportSize({ width: size.width, height: size.height })
    await page.waitForTimeout(100)
    const topHeight = await page.locator('.mp-header').evaluate(el => el.getBoundingClientRect().height)
    const closed = await canvasVisibleRatio(page)
    expect(topHeight, `${size.name}: compact header`).toBeLessThanOrEqual(48)
    expect(closed, `${size.name}: closed drawer canvas visibility`).toBeGreaterThanOrEqual(.70)
    for (const [name, aria] of [['mission', '碼頭區說明'], ['map', '共同世界地圖'], ['beacon', '點燈任務'], ['people', '旅人與 NPC'], ['account', '帳號卡']]) {
      await page.getByRole('button', { name: aria }).click()
      const open = await canvasVisibleRatio(page)
      expect(open, `${size.name} ${name}: open drawer canvas visibility`).toBeGreaterThanOrEqual(.40)
      expect(await page.locator('.mp-mobile-drawer > [data-mobile-pane]:visible').count(), `${size.name} ${name}: only one drawer`).toBe(1)
      if (name === 'people') await page.locator('.mp-mobile-drawer').evaluate(el => { el.scrollTop = el.scrollHeight })
      const audit = await auditMobileUi(page)
      expect(audit.misses, `${size.name} ${name}: every visible button target`).toEqual([])
      expect(audit.smallText, `${size.name} ${name}: every visible text is >=14px`).toEqual([])
      expect(audit.lowContrast, `${size.name} ${name}: visible text contrast >=4.5:1`).toEqual([])
      console.log(`[mobile-layout] drawer size=${size.name} type=${name} canvasVisible=${(open * 100).toFixed(1)}%`)
      if (size.width === 375 && name === 'mission') await page.screenshot({ path: testInfo.outputPath(`mobile-open-${name}.png`) })
      await page.locator('.mp-drawer-scrim').click({ position: { x: 1, y: 35 } })
      await expect(page.locator('.mp-mobile-drawer')).toHaveAttribute('data-open', 'false')
      expect(await canvasVisibleRatio(page), `${size.name} ${name}: closed again`).toBeGreaterThanOrEqual(.70)
    }
    const widths = await page.evaluate(() => ({ viewport: innerWidth, page: document.documentElement.scrollWidth }))
    expect(widths.page, `${size.name}: no horizontal page scroll`).toBeLessThanOrEqual(widths.viewport)
    console.log(`[mobile-layout] size=${size.name} header=${topHeight}px canvasClosed=${(closed * 100).toFixed(1)}% scroll=${widths.page}/${widths.viewport}`)
  }
})

test('beacon action is hit-testable at its center on mobile', async ({ page }) => {
  await mobilePage(page)
  await page.getByRole('button', { name: '點燈任務' }).click()
  const action = page.getByRole('button', { name: '交付物資 · 點亮燈塔' })
  await expect(action).toBeVisible()
  const hit = await action.evaluate(button => {
    const rect = button.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    return { hit: document.elementFromPoint(x, y) === button, x, y }
  })
  expect(hit.hit, 'beacon action center elementFromPoint').toBe(true)
  await saveEvidence(page, 'a-beacon-button-center.png')
  console.log(`[mobile-layout] beacon centerHit=${hit.hit} point=${hit.x.toFixed(1)},${hit.y.toFixed(1)}`)
})

test('NPC chat input is clickable, editable, readable and unobscured', async ({ page }) => {
  await mobilePage(page)
  await page.getByRole('button', { name: '旅人與 NPC' }).click()
  const input = page.getByRole('textbox', { name: '世界聊天訊息' })
  await expect(input).toBeVisible()
  await input.scrollIntoViewIfNeeded()
  const before = await input.evaluate(el => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    return { hit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === el, fontSize: parseFloat(style.fontSize) }
  })
  await input.click()
  await input.fill('mobile chat check')
  await expect(input).toHaveValue('mobile chat check')
  expect(before.hit).toBe(true)
  expect(before.fontSize).toBeGreaterThanOrEqual(16)
  await saveEvidence(page, 'b-npc-chat-input.png')
  console.log(`[mobile-layout] chat centerHit=${before.hit} fontSize=${before.fontSize}px value=mobile chat check`)
})

test('two-second full joystick deflection moves the server-persisted account position by at least one unit', async ({ page }) => {
  await mobilePage(page)
  const coordinate = async () => {
    const text = await page.locator('.mp-account-drawer p').textContent().catch(() => null)
    if (text) return text
    await page.getByRole('button', { name: '帳號卡' }).click()
    return page.locator('.mp-account-drawer p').textContent()
  }
  const readPoint = async () => {
    const value = await coordinate()
    const match = value?.match(/帳號 #\d+ · (-?\d+(?:\.\d+)?), (-?\d+(?:\.\d+)?)/)
    if (!match) throw new Error(`Could not parse server position: ${value}`)
    return { x: Number(match[1]), z: Number(match[2]) }
  }
  await page.getByRole('button', { name: '帳號卡' }).click()
  const before = await readPoint()
  await page.getByRole('button', { name: '帳號卡' }).click()
  const stick = page.locator('.mp-stick')
  const rect = await stick.boundingBox()
  if (!rect) throw new Error('Joystick is not visible')
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2)
  await page.mouse.down()
  const deflectionX = before.x > 0 ? rect.x + 5 : rect.x + rect.width - 5
  await page.mouse.move(deflectionX, rect.y + rect.height / 2, { steps: 8 })
  await page.waitForTimeout(2_100)
  await page.mouse.up()
  await page.waitForTimeout(350)
  await page.getByRole('button', { name: '帳號卡' }).click()
  const after = await readPoint()
  const distance = Math.hypot(after.x - before.x, after.z - before.z)
  expect(distance, `server position delta ${before.x},${before.z} → ${after.x},${after.z}`).toBeGreaterThanOrEqual(1)
  await saveEvidence(page, 'c-joystick-two-seconds.png')
  console.log(`[mobile-layout] joystick before=${before.x},${before.z} after=${after.x},${after.z} delta=${distance.toFixed(2)}`)
})

test('mobile readable text and visible button centers meet touch requirements', async ({ page }) => {
  await mobilePage(page)
  for (const size of sizes.filter(item => item.width < 768)) {
    await page.setViewportSize({ width: size.width, height: size.height })
    const result = await page.evaluate(() => {
      const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
      const buttons = [...document.querySelectorAll('button')].filter(visible)
      const misses = buttons.flatMap(button => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === button && r.width >= 44 && r.height >= 44 ? [] : [button.textContent?.trim() || button.getAttribute('aria-label') || 'unnamed'] })
      const smallText = [...document.querySelectorAll('body *')].filter(visible).filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim())).flatMap(el => { const size = parseFloat(getComputedStyle(el).fontSize); const minimum = el.classList.contains('mp-tool-label') ? 12 : 14; return size < minimum && !el.closest('.mp-authority,.mp-progress-note,.mp-controls-hint') ? [{ text: el.textContent?.trim().slice(0, 32), size }] : [] })
      const version = [...document.querySelectorAll('.mp-authority')].some(el => visible(el))
      return { viewport: innerWidth, scroll: document.documentElement.scrollWidth, misses, smallText, version }
    })
    expect(result.scroll, `${size.name} horizontal scroll`).toBeLessThanOrEqual(result.viewport)
    expect(result.misses, `${size.name} button hit targets`).toEqual([])
    expect(result.smallText, `${size.name} readable text`).toEqual([])
    expect(result.version, `${size.name} version hidden`).toBe(false)
    console.log(`[mobile-layout] typography size=${size.name} readable=${result.smallText.length === 0} buttons=${result.misses.length} versionVisible=${result.version} scroll=${result.scroll}/${result.viewport}`)
  }
  await page.setViewportSize({ width: 375, height: 812 })
  await saveEvidence(page, 'd-readable-controls.png')
})

test('edge camera keeps the actor visible and renders scene detail at mobile and desktop sizes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await register(page)
  const canvas = page.locator('.mp-canvas')
  const baselineCamera = await canvas.evaluate(el => ({
    cameraDistance: Number(el.getAttribute('data-camera-distance')),
    playerVisibility: Number(el.getAttribute('data-player-visibility')),
    obstructed: el.getAttribute('data-camera-obstructed') === 'true',
    orbitOffset: Number(el.getAttribute('data-camera-orbit-offset')),
  }))
  // Reach the wall with real joystick input and stop from authoritative server coordinates.
  await holdJoystickUntil(page, 'x', 4.1)
  await holdJoystickUntil(page, 'z', 10.4)
  const accountPosition = await readAccountPosition(page)
  expect(accountPosition.tileId, 'account drawer confirms dock tile').toBe('t_dock')
  expect(accountPosition.x, `before turn x=${accountPosition.x}`).toBeGreaterThanOrEqual(3.4)
  expect(accountPosition.x, `before turn x=${accountPosition.x}`).toBeLessThanOrEqual(4.6)
  expect(accountPosition.z, `before turn z=${accountPosition.z}`).toBeGreaterThanOrEqual(9.2)
  expect(accountPosition.z, `before turn z=${accountPosition.z}`).toBeLessThanOrEqual(10.8)
  await steerJoystick(page, -.4, .4, 100)
  const position = await readAccountPosition(page)
  expect(position.tileId, 'edge diagnostic stays in dock').toBe('t_dock')
  expect(position.x, `camera test x=${position.x}`).toBeGreaterThanOrEqual(3.0)
  expect(position.x, `camera test x=${position.x}`).toBeLessThanOrEqual(4.6)
  expect(position.z, `camera test z=${position.z}`).toBeGreaterThanOrEqual(9)
  expect(position.z, `camera test z=${position.z}`).toBeLessThanOrEqual(11.5)

  await page.getByRole('button', { name: '重置鏡頭' }).click()
  await page.waitForTimeout(250)
  const firstCamera = await canvas.evaluate(el => ({
    cameraDistance: Number(el.getAttribute('data-camera-distance')),
    playerVisibility: Number(el.getAttribute('data-player-visibility')),
    obstructed: el.getAttribute('data-camera-obstructed') === 'true',
    orbitOffset: Number(el.getAttribute('data-camera-orbit-offset')),
  }))
  console.log(`[mobile-layout] edge-camera 375 camera=${JSON.stringify(firstCamera)} account=${JSON.stringify(position)}`)
  await canvas.screenshot({ path: testInfo.outputPath('camera-canvas-375.png') })
  const phonePixels = await canvasPixelMetrics(page)
  expect(phonePixels.quantizedColors, '375x812 canvas color variation').toBeGreaterThan(30)
  expect(phonePixels.edgeRatio, '375x812 scene has non-gradient edges').toBeGreaterThan(.009)
  expect(firstCamera.obstructed, `camera should meet a blocker at x=${position.x}, z=${position.z}`).toBe(true)
  expect(firstCamera.cameraDistance, 'blocked camera stays at least four units away').toBeGreaterThanOrEqual(4)
  expect(firstCamera.playerVisibility, 'blocked camera never fully hides the player').toBeGreaterThanOrEqual(.6)
  expect(firstCamera.orbitOffset, 'blocked camera moves around the wall').not.toBe(0)
  await saveEvidence(page, 'camera-blocked-after.png')

  const viewports = [
    { width: 393, height: 852 },
    { width: 430, height: 932 },
    { width: 1280, height: 800 },
  ]
  const results = [{ width: 375, height: 812, ...firstCamera, ...phonePixels }]
  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(180)
    await page.getByRole('button', { name: '重置鏡頭' }).click()
    await page.waitForTimeout(250)
    const camera = await canvas.evaluate(el => ({
      cameraDistance: Number(el.getAttribute('data-camera-distance')),
      playerVisibility: Number(el.getAttribute('data-player-visibility')),
      obstructed: el.getAttribute('data-camera-obstructed') === 'true',
      orbitOffset: Number(el.getAttribute('data-camera-orbit-offset')),
    }))
    expect(camera.obstructed, `${viewport.width}x${viewport.height}: ray is obstructed`).toBe(true)
    expect(camera.cameraDistance, `${viewport.width}x${viewport.height}: safe camera distance`).toBeGreaterThanOrEqual(4)
    expect(camera.playerVisibility, `${viewport.width}x${viewport.height}: player is visible`).toBeGreaterThanOrEqual(.6)
    expect(camera.orbitOffset, `${viewport.width}x${viewport.height}: camera orbits around the blocker`).not.toBe(0)
    const pixels = await canvasPixelMetrics(page)
    expect(pixels.quantizedColors, `${viewport.width}x${viewport.height}: canvas color variation`).toBeGreaterThan(30)
    expect(pixels.edgeRatio, `${viewport.width}x${viewport.height}: rendered scene detail`).toBeGreaterThan(.009)
    results.push({ ...viewport, ...camera, ...pixels })
  }
  expect(baselineCamera.cameraDistance, 'unobstructed camera distance remains unchanged').toBeCloseTo(8, 1)
  expect(baselineCamera.playerVisibility, 'unobstructed player visibility remains unchanged').toBe(1)
  expect(baselineCamera.obstructed, 'spawn camera is unobstructed').toBe(false)

  // Turning the camera behind the wall is a second obstruction route, separate from recenter.
  await page.setViewportSize({ width: 375, height: 812 })
  await page.waitForTimeout(180)
  await page.mouse.move(250, 420)
  await page.mouse.down()
  await page.mouse.move(110, 420, { steps: 10 })
  await page.waitForTimeout(300)
  await page.mouse.up()
  await page.waitForTimeout(250)
  let alternateCamera = await canvas.evaluate(el => ({
    cameraDistance: Number(el.getAttribute('data-camera-distance')),
    playerVisibility: Number(el.getAttribute('data-player-visibility')),
    obstructed: el.getAttribute('data-camera-obstructed') === 'true',
    orbitOffset: Number(el.getAttribute('data-camera-orbit-offset')),
  }))
  expect(alternateCamera.cameraDistance, 'dragged camera remains outside its minimum').toBeGreaterThanOrEqual(4)
  expect(alternateCamera.playerVisibility, 'dragging behind a wall does not hide the player').toBeGreaterThanOrEqual(.6)
  if (alternateCamera.obstructed) expect(alternateCamera.orbitOffset, 'dragged camera has a clear orbit').not.toBe(0)
  let alternatePixels = await canvasPixelMetrics(page)
  expect(alternatePixels.edgeRatio, 'dragged view remains more than fog gradient').toBeGreaterThan(.009)

  // A page reload recreates the camera at defaults without resetting server position.
  const positionBeforeReload = await readServerPosition(page)
  await page.reload()
  await expect(page.locator('.mp-connection')).toHaveText('世界已連線', { timeout: 20_000 })
  await expect(page.locator('.mp-scene-loading')).toHaveCount(0, { timeout: 20_000 })
  let recoveredCamera = await canvas.evaluate(el => ({
    cameraDistance: Number(el.getAttribute('data-camera-distance')),
    playerVisibility: Number(el.getAttribute('data-player-visibility')),
    obstructed: el.getAttribute('data-camera-obstructed') === 'true',
    orbitOffset: Number(el.getAttribute('data-camera-orbit-offset')),
  }))
  expect(recoveredCamera.cameraDistance, 'reload camera starts at its default distance').toBeCloseTo(8, 1)
  expect(recoveredCamera.playerVisibility, 'reload restores full player visibility').toBe(1)
  expect(recoveredCamera.obstructed, 'reload starts without the old camera hit').toBe(false)
  expect(await readServerPosition(page), 'reload preserves server-owned player position').toEqual(positionBeforeReload)
  await page.getByRole('button', { name: '重置鏡頭' }).click()
  await steerJoystick(page, 1, -1, 2_500)
  await steerJoystick(page, 0, 1, 2_500)
  recoveredCamera = await canvas.evaluate(el => ({
    cameraDistance: Number(el.getAttribute('data-camera-distance')),
    playerVisibility: Number(el.getAttribute('data-player-visibility')),
    obstructed: el.getAttribute('data-camera-obstructed') === 'true',
    orbitOffset: Number(el.getAttribute('data-camera-orbit-offset')),
  }))
  expect(recoveredCamera.cameraDistance, 'opposite then up leaves a valid camera distance').toBeGreaterThanOrEqual(4)
  expect(recoveredCamera.playerVisibility, 'opposite then up does not hide the player').toBeGreaterThanOrEqual(.6)
  if (recoveredCamera.obstructed) expect(recoveredCamera.orbitOffset, 'opposite then up camera has a clear orbit').not.toBe(0)
  alternatePixels = await canvasPixelMetrics(page)
  expect(alternatePixels.edgeRatio, 'opposite then up does not return to fog-only view').toBeGreaterThan(.009)
  console.log(`[mobile-layout] edge-camera alternate blocked=${alternateCamera.obstructed} camera=${JSON.stringify(alternateCamera)} recovery=${JSON.stringify(recoveredCamera)} alternatePixels=${alternatePixels.edgeRatio.toFixed(4)}`)
  console.log(`[mobile-layout] edge-camera account=${position.accountId} position=${position.x.toFixed(2)},${position.z.toFixed(2)} baselineDistance=${baselineCamera.cameraDistance} baselineVisibility=${baselineCamera.playerVisibility} results=${JSON.stringify(results)}`)
})

test('mobile menu contains all account routes and opens no more than 40 percent over the scene', async ({ page }) => {
  await mobilePage(page)
  await page.getByRole('button', { name: '選單' }).click()
  const required = ['世界總覽', '個人資料', '卡冊', '社交與交易', '帳號復原', '登出']
  for (const label of required) await expect(page.getByRole('navigation', { name: '遊戲選單' }).getByText(label, { exact: true })).toBeVisible()
  const ratio = await canvasVisibleRatio(page)
  expect(ratio, 'menu-open scene visibility').toBeGreaterThanOrEqual(.40)
  const audit = await auditMobileUi(page)
  expect(audit.misses).toEqual([])
  expect(audit.smallText).toEqual([])
  expect(audit.lowContrast).toEqual([])
  await saveEvidence(page, 'e-mobile-menu.png')
  console.log(`[mobile-layout] menu canvasVisible=${(ratio * 100).toFixed(1)}% items=${required.length}`)
  await page.locator('.mp-menu-scrim').click({ position: { x: 1, y: 35 } })
  await expect(page.getByRole('navigation', { name: '遊戲選單' })).toHaveCount(0)
})
