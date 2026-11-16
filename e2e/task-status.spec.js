import { expect, test } from '@playwright/test'

const body = '# Projeto\n\n- [ ] Escrever\n- [ ] Revisar\n\nFim'
const mode = (page, name) => page.getByRole('radio', { name, exact: true }).check({ force: true })
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((body) => {
    localStorage.setItem(
      'sloth-note:v3',
      JSON.stringify({
        version: 3,
        notes: [{ id: 'a', name: 'Projeto.md', body, revision: 0 }],
        trash: [],
        openIds: ['a'],
        activeId: 'a',
        preferences: { tabsVisible: true, language: 'pt-BR', theme: 'dark', fontSize: 16 },
      }),
    )
  }, body)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('Alt+2…5 mudam o status da linha e a data acompanha concluir e reabrir', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'Escrever' }).click()
  await page.keyboard.press('Alt+2')
  await expect(page.locator('.cm-line', { hasText: 'Escrever' })).toContainText('[/]')
  await page.keyboard.press('Alt+3')
  await expect(page.locator('.cm-line', { hasText: 'Escrever' })).toContainText('[>]')
  await page.keyboard.press('Alt+4')
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(
    `# Projeto\n\n- [x] Escrever ✅ ${today()}\n- [ ] Revisar\n\nFim`,
  )
  await mode(page, 'Padrão')
  await page.locator('.cm-line', { hasText: 'Escrever' }).click()
  await page.keyboard.press('Alt+5')
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(
    `# Projeto\n\n- [-] Escrever ❌ ${today()}\n- [ ] Revisar\n\nFim`,
  )
  await mode(page, 'Padrão')
  await page.locator('.cm-line', { hasText: 'Escrever' }).click()
  await page.keyboard.press('Alt+1')
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(/- \[ \] Escrever\n- \[ \] Revisar/)
})

test('o menu do clique direito troca o status e o progresso mostra os estados', async ({
  page,
}) => {
  await page.locator('.cm-line', { hasText: 'Fim' }).click()
  await page.locator('.task-checkbox').first().click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Status da tarefa' })
  await expect(menu.getByRole('menuitemradio')).toHaveCount(5)
  await menu.getByRole('menuitemradio', { name: /Fazendo/ }).click()
  await expect(page.locator('.task-checkbox').first()).toHaveAttribute('data-status', 'doing')
  await expect(menu).toHaveCount(0)
  await page.locator('.task-checkbox').nth(1).click({ button: 'right' })
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(/- \[\/\] Escrever\n- \[ \] Revisar/)
})

test('a barra de progresso separa tarefas em andamento e informa no rótulo', async ({ page }) => {
  await mode(page, 'Código')
  await page
    .locator('textarea')
    .fill('# P\n\n## Seção\n\n- [x] A\n- [/] B\n- [>] C\n- [-] D\n- [ ] E')
  await mode(page, 'Leitura')
  const badge = page.locator('.visual-editor .section-progress').first()
  await expect(badge.locator('.section-progress-count')).toHaveAttribute('data-count', '1/4')
  await expect(badge).toHaveAttribute('aria-label', /1 de 4.*1 fazendo.*1 esperando/)
})

test('Arquivar tarefas concluídas move para o Arquivo recolhido e desfazer devolve', async ({
  page,
}) => {
  const original = '# P\n\n## Seção\n\n- [x] Feita\n- [ ] Aberta\n- [-] Cancelada\n'
  await mode(page, 'Código')
  await page.locator('textarea').fill(original)
  await mode(page, 'Padrão')
  await page.keyboard.press('Control+Shift+P')
  await page.getByRole('combobox').fill('Arquivar tarefas')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Tarefas arquivadas: 2')).toBeVisible()
  await expect(page.locator('.cm-line', { hasText: 'Cancelada' })).toHaveCount(0)
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(
    '# P\n\n## Seção\n\n- [ ] Aberta\n\n## Arquivo\n\n### Seção\n\n- [x] Feita\n- [-] Cancelada\n',
  )
})

test('desfazer reverte o arquivamento inteiro de uma vez e o Arquivo abre recolhido', async ({
  page,
}) => {
  const original = '# P\n\n## Seção\n\n- [x] Feita\n- [ ] Aberta\n'
  await mode(page, 'Código')
  await page.locator('textarea').fill(original)
  await mode(page, 'Padrão')
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Shift+P')
  await page.getByRole('combobox').fill('Arquivar tarefas')
  await page.keyboard.press('Enter')
  await expect(page.getByText('Tarefas arquivadas: 1')).toBeVisible()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+z')
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(original)
})
