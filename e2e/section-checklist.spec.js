import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const body =
  '# Checklist\n\n## Projeto\n\n- [x] Pronta\n- [ ] Aberta\n\n### Etapa\n\n- [-] Em andamento\n\n```md\n- [ ] Exemplo\n```\n\n## Outra\n\n- [ ] Não alterar'

for (const mode of ['Padrão', 'Leitura']) {
  test(`heading checklist toggles the section and subsections in ${mode}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill(body)
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    const box = page.getByRole('checkbox', { name: 'Selecionar tarefas de Projeto', exact: true })
    await expect(box).toHaveJSProperty('indeterminate', true)
    await box.check()
    await expect(box).toBeChecked()
    await expect(box).toHaveJSProperty('indeterminate', false)
    await expect(
      page.getByRole('checkbox', { name: 'Selecionar tarefas de Etapa', exact: true }),
    ).toBeChecked()
    await expect(
      page.getByRole('checkbox', { name: 'Selecionar tarefas de Outra', exact: true }),
    ).not.toBeChecked()
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(violations).toEqual([])
    await box.focus()
    await box.press('Space')
    await expect(box).not.toBeChecked()
    await expect(box).toHaveJSProperty('indeterminate', false)
    if (mode === 'Padrão') {
      await page.locator('.cm-content').press('Control+z')
      await expect(box).toBeChecked()
    } else await box.check()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(
      body
        .replace('- [ ] Aberta', '- [x] Aberta')
        .replace('- [-] Em andamento', '- [x] Em andamento'),
    )
  })
  test(`heading checklist works with collapsed sections in ${mode}`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill(body)
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    const heading = page
      .locator(mode === 'Padrão' ? '.cm-md-h2' : '.markdown h2')
      .filter({ hasText: 'Projeto' })
    await heading.hover()
    await heading.getByRole('button', { name: 'Recolher seção', exact: true }).click()
    await heading.getByRole('checkbox').check()
    await expect(heading.getByRole('checkbox')).toBeChecked()
    await expect(heading.locator('.section-progress')).toHaveAttribute(
      'aria-label',
      '3 de 3 tarefas concluídas',
    )
  })
}
