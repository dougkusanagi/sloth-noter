import { test, expect } from '@playwright/test'

for (const [width, height] of [
  [1280, 800],
  [390, 844],
])
  test(`the + after the last tab opens a new note at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    await expect(page.locator('.cm-content')).toBeVisible()
    const before = await page.locator('.tab-wrap').count()
    const button = page.locator('.tabs .tab-new')
    await expect(button).toBeInViewport()
    await button.click()
    await expect(page.locator('.tab-wrap')).toHaveCount(before + 1)
    await expect(button).toBeInViewport()
  })
