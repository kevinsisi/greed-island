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

async function auditMobileUi(page: Page) {
  return page.evaluate(() => {
    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
    const buttons = [...document.querySelectorAll('button')].filter(visible)
    const misses = buttons.flatMap(button => { const r = button.getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === button && r.width >= 44 && r.height >= 44 ? [] : [button.textContent?.trim() || button.getAttribute('aria-label') || 'unnamed'] })
    const smallText = [...document.querySelectorAll('body *')].filter(visible).filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim())).flatMap(el => { const size = parseFloat(getComputedStyle(el).fontSize); return size < 14 && !el.closest('.mp-authority,.mp-progress-note,.mp-controls-hint') ? [{ text: el.textContent?.trim().slice(0, 32), size }] : [] })
    return { misses, smallText }
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
      const smallText = [...document.querySelectorAll('body *')].filter(visible).filter(el => [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim())).flatMap(el => { const size = parseFloat(getComputedStyle(el).fontSize); return size < 14 && !el.closest('.mp-authority,.mp-progress-note,.mp-controls-hint') ? [{ text: el.textContent?.trim().slice(0, 32), size }] : [] })
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
  await saveEvidence(page, 'e-mobile-menu.png')
  console.log(`[mobile-layout] menu canvasVisible=${(ratio * 100).toFixed(1)}% items=${required.length}`)
  await page.locator('.mp-menu-scrim').click({ position: { x: 1, y: 35 } })
  await expect(page.getByRole('navigation', { name: '遊戲選單' })).toHaveCount(0)
})
