import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`code selection stays above its background at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page
      .locator('textarea')
      .fill('# Código\n\n```js\nconst message = "Texto selecionado";\n```')
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const line = page.locator('.cm-md-code').filter({ hasText: 'const message' })
    const rect = await line.boundingBox()
    await page.mouse.move(rect.x + 18, rect.y + rect.height / 2)
    await page.mouse.down()
    await page.mouse.move(rect.x + 160, rect.y + rect.height / 2, { steps: 10 })
    await page.mouse.up()
    await expect(page.locator('.cm-selectionBackground').first()).toBeVisible()
    await expect(page.locator('.cm-selectionLayer')).toHaveCSS('z-index', '2')
    await page.screenshot({ path: `/tmp/sloth-code-selection-${width}.png` })
  })
}
