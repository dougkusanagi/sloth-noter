import { test, expect } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`width presets belong to text width at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Aparência', exact: true }).click()
    const section = page.locator('.menu-adjustment').filter({ hasText: 'Largura do documento' })
    const wide = section.getByRole('menuitemradio', { name: 'Ampla', exact: true })
    await expect(wide).toBeVisible()
    await expect(wide).toHaveCSS('font-size', '11px')
    await wide.click()
    await expect(wide).toHaveAttribute('aria-checked', 'true')
    await page.screenshot({ path: `/tmp/width-presets-${width}.png` })
  })
}
