import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`shows a searchable completion date at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const source = '# Compras\n\n- [x] Comprar café ✅ 2026-11-23\n- [ ] Comprar pão'
    await page.locator('textarea').fill(source)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const date = page.locator('time.task-completion-date')
    await expect(date).toHaveText('23/11/2026')
    await expect(date).toHaveAttribute('datetime', '2026-11-23')
    await page.screenshot({ path: `/tmp/sloth-task-completion-date-${width}.png` })
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(source)
    if (width === 1280) {
      await page.getByRole('textbox', { name: 'Buscar em todas as notas…' }).fill('23/11/2026')
      await expect(page.locator('.note-search-snippet mark')).toHaveText('2026-11-23')
    }
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    const news = page.locator('.visual-editor.read-only')
    await expect(news).toContainText('Datas de conclusão em formato brasileiro.')
    await news.locator('[data-wiki^="Sloth Note 0.31.0"]').click()
    await expect(news).toContainText('busca da biblioteca aceita os dois formatos')
    const image = news.getByRole('img', { name: 'Data de conclusão ao lado de uma tarefa marcada' })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0)
  })
}
