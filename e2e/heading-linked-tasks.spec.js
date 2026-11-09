import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  for (const mode of ['Padrão', 'Leitura']) {
    test(`linked H2 shows target totals in ${mode} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 })
      await page.addInitScript(() => {
        const parent =
          '# À Fazer\n\n## [[Sistema de Estoque]]\n\n## Sistema Catálogo\n\n- [ ] Outra tarefa\n\n## [[Ausente]]'
        const child =
          '# Sistema de Estoque\n\n' +
          Array.from(
            { length: 10 },
            (_, i) => `- [${i < 4 ? 'x' : i === 4 ? '-' : ' '}] Tarefa ${i + 1}`,
          ).join('\n')
        localStorage.setItem(
          'sloth-note:v3',
          JSON.stringify({
            version: 3,
            notes: [
              { id: 'parent', name: 'À Fazer.md', body: parent, revision: 0 },
              { id: 'child', name: 'Sistema de Estoque.md', body: child, revision: 0 },
            ],
            trash: [],
            openIds: ['parent', 'child'],
            activeId: 'parent',
            preferences: {
              theme: 'dark',
              fontSize: 16,
              language: 'pt-BR',
              tabsVisible: true,
              sidebarVisible: false,
            },
          }),
        )
      })
      await page.goto('/')
      await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
      const root = page.locator('.visual-editor')
      await expect(root.locator('.section-progress-count[data-count="4/10"]')).toHaveCount(1)
      await expect(root.locator('.section-progress-count[data-count="0/1"]')).toHaveCount(1)
      await page.screenshot({ path: test.info().outputPath(`heading-${width}.png`) })
      await page.locator('.tab').filter({ hasText: 'Sistema de Estoque' }).click()
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
      await page.locator('textarea').fill('# Sistema de Estoque\n\n- [x] Concluída\n- [ ] Pendente')
      await page.locator('.tab').filter({ hasText: 'À Fazer' }).click()
      await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
      await expect(root.locator('.section-progress-count[data-count="1/2"]')).toHaveCount(1)
    })
  }
}
