import { expect, test } from '@playwright/test'

for (const mode of ['Padrão', 'Código', 'Leitura']) {
  test(`status counts the selection and resets when it collapses in ${mode}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill('# Contagem\n\nOlá mundo\nmais texto')
    if (mode !== 'Código')
      await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    if (mode === 'Leitura') {
      await page.locator('.reading .markdown p').evaluate((el) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      })
    } else {
      const editor = page.locator(mode === 'Padrão' ? '.cm-content' : 'textarea')
      await editor.focus()
      await editor.press('Control+End')
      await editor.press('Home')
      await editor.press('Shift+End')
    }
    const stats = page.locator('.selection-statistics')
    await expect(stats).toContainText(mode === 'Leitura' ? '4 palavras' : '2 palavras')
    await expect(stats).toContainText(mode === 'Leitura' ? '20 caracteres' : '10 caracteres')
    await expect(stats).toContainText(mode === 'Leitura' ? '2 linhas' : '1 linha')
    if (mode === 'Leitura') await page.evaluate(() => window.getSelection().removeAllRanges())
    else await page.keyboard.press('ArrowRight')
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
