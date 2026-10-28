import { expect, test } from '@playwright/test'

for (const mode of ['Padrão', 'Código', 'Leitura']) {
  test(`status counts the selection and resets when it collapses in ${mode}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill('# Contagem\n\nOlá mundo\nmais texto')
    if (mode !== 'Código')
      await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    // Leitura is the read-only visual editor, so it selects like Padrão.
    const editor = page.locator(mode === 'Código' ? 'textarea' : '.cm-content')
    await editor.focus()
    await editor.press('Control+End')
    await editor.press('Home')
    await editor.press('Shift+End')
    const stats = page.locator('.selection-statistics')
    await expect(stats).toContainText('2 palavras')
    await expect(stats).toContainText('10 caracteres')
    await expect(stats).toContainText('1 linha')
    await page.keyboard.press('ArrowRight')
    await expect(stats).toHaveCount(0)
    await expect(page.locator('.document-info')).toContainText('5 palavras')
    if (mode === 'Código') {
      await page.locator('textarea').press('Control+a')
      await expect(stats).toBeVisible()
      await page.locator('textarea').fill('# Curta\n\nTexto')
      await expect(stats).toHaveCount(0)
    }
  })
}
