import { randomBytes } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'

const sizes = [
  { name: '375x812', width: 375, height: 812 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
]

async function register(page: Page) {
  const account = `layout-${randomBytes(8).toString('hex')}`
  const password = `layout-only-${randomBytes(20).toString('base64url')}`
  await page.goto('/game')
  await page.getByRole('button', { name: '申請帳號', exact: true }).click()
  await page.locator('#mp-username').fill(account)
  await page.locator('#mp-password').fill(password)
  await page.locator('#mp-confirm-password').fill(password)
  await page.getByRole('button', { name: '建立帳號並進入 →', exact: true }).click()
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
        console.log(`[mobile-layout-e2e] viewport=${size.name} scrollWidth=${result.scrollWidth} viewportWidth=${result.viewportWidth} selector=${result.selectWidth}px labelWidth=${result.requiredTextWidth.toFixed(1)}/${result.availableTextWidth.toFixed(1)} screenshot=${path}`)
      })
    }
  } finally {
    await context.close()
  }
})
