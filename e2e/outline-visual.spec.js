import { test, expect } from '@playwright/test'
test('outline visual verification', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .getByRole('textbox', { name: 'Editor Markdown em texto puro' })
    .fill(
      '# Guia de escrita\n\nUma introdução para organizar as ideias.\n\n## Modelos e referências\n\nUm parágrafo com informações para consultar depois.\n\n### Detalhes importantes\n\nMais um parágrafo para conferir o ritmo da leitura.\n\n## Próximos passos\n\nTexto final.',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.screenshot({ path: `/tmp/sloth-outline-${width}-closed.png` })
    await page.getByRole('button', { name: 'Expandir sumário', exact: true }).click()
    await expect(page.locator('.document-outline')).toHaveClass(/is-open/)
    await expect(page.locator('.document-outline')).toHaveCSS('border-radius', '8px')
    await page.screenshot({ path: `/tmp/sloth-outline-${width}-open.png` })
    await page.getByRole('button', { name: 'Recolher sumário', exact: true }).click()
  }
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: /Novidades/ }).click()
  await page.locator('[data-wiki^="Em desenvolvimento"]').first().click()
  await expect(page.locator('.cm-content')).toContainText('O editor agora oferece um sumário')
  await page.locator('.visual-editor.read-only').hover()
  await expect
    .poll(async () => {
      if ((await page.locator('.cm-content').textContent()).includes('Exportar XLSX')) return true
      await page.mouse.wheel(0, 400)
      return false
    })
    .toBe(true)
  await expect
    .poll(async () => {
      const image = page.locator('img[src*="tabela-dimensoes"]')
      if (await image.count()) return image.evaluate((el) => el.complete && el.naturalWidth > 0)
      await page.mouse.wheel(0, 300)
      return false
    })
    .toBe(true)
})
