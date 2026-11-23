import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`insert, edit and read a callout at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page
      .getByRole('radio', { name: 'Código', exact: true })
      .evaluate((radio) => radio.click())
    await page.locator('textarea').fill('# Manual\n\nTexto anterior.\n\n')
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    await page.locator('.cm-line', { hasText: 'Texto anterior.' }).click()
    await page.keyboard.press('ControlOrMeta+End')
    await page.keyboard.type('/')
    await page.getByRole('button', { name: 'Alerta — Dica', exact: true }).click()
    await expect(page.locator('.cm-md-callout.callout-title')).toHaveText('Dica')
    await page.keyboard.type('Revise os links.')
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(page.locator('[data-callout="tip"]').last()).toHaveText('Revise os links.')
    await page
      .getByRole('radio', { name: 'Código', exact: true })
      .evaluate((radio) => radio.click())
    await expect(page.locator('textarea')).toHaveValue(/> \[!TIP\]\n> Revise os links\./)
  })
}
