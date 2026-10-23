import { expect, test } from '@playwright/test'

test('?platform=mobile opens the mobile shell', async ({ page }) => {
  await page.goto('/?platform=mobile')
  await expect(page.locator('[data-platform="mobile"]')).toBeVisible()
  await expect(page.locator('.cm-content')).toHaveCount(0)
})
