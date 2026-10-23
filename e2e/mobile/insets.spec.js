import { expect, test } from '@playwright/test'

const shell = '[data-platform="mobile"]'

// toHaveCSS waits for the value: the app's reduced-motion rule turns padding changes into 0.01 ms transitions.
async function reportInsets(page, values) {
  await page.evaluate((next) => window.__insets(next), values)
}

test('#1 the status bar does not cover the top of the mobile shell', async ({ page }) => {
  await page.goto('/?platform=mobile')
  await reportInsets(page, { top: 32, bottom: 24, ime: 0, keyboard: 'closed' })
  await expect(page.locator(shell)).toHaveCSS('padding-top', '32px')
  const heading = await page.locator('h1').boundingBox()
  expect(heading.y).toBeGreaterThanOrEqual(32)
})

test('#3 the gesture bar keeps the bottom bar above it', async ({ page }) => {
  await page.goto('/?platform=mobile')
  await reportInsets(page, { top: 0, bottom: 24, ime: 0, keyboard: 'closed' })
  await expect(page.locator(shell)).toHaveCSS('padding-bottom', '24px')
})

test('#3 an open keyboard replaces the gesture padding instead of adding to it', async ({
  page,
}) => {
  await page.goto('/?platform=mobile')
  await reportInsets(page, { top: 0, bottom: 24, ime: 300, keyboard: 'open' })
  await expect(page.locator('html')).toHaveAttribute('data-keyboard', 'open')
  await expect(page.locator(shell)).toHaveCSS('padding-bottom', '300px')
  await reportInsets(page, { top: 0, bottom: 24, ime: 0, keyboard: 'closed' })
  await expect(page.locator('html')).toHaveAttribute('data-keyboard', 'closed')
  await expect(page.locator(shell)).toHaveCSS('padding-bottom', '24px')
})

test('the native shell takes over: the browser fallback no longer changes insets', async ({
  page,
}) => {
  await page.goto('/?platform=mobile')
  await reportInsets(page, { top: 0, bottom: 0, ime: 0, keyboard: 'closed' })
  await page.evaluate(() => window.__insetsFallback({ ime: 250, keyboard: 'open' }))
  await expect(page.locator(shell)).toHaveCSS('padding-bottom', '0px')
})
