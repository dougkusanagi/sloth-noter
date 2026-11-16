import { expect, test } from '@playwright/test'

const body =
  '# Projeto\n\n## Backend\n\n- [x] API\n- [/] Cache\n    - [ ] Redis\n- [ ] Fila\n\n## Frontend\n\n- [ ] Tela\n'
const mode = (page, name) => page.getByRole('radio', { name, exact: true }).check({ force: true })
const source = (page) => page.locator('textarea')

test.beforeEach(async ({ page }) => {
  await page.addInitScript((body) => {
    if (localStorage.getItem('sloth-note:v3')) return
    localStorage.setItem(
      'sloth-note:v3',
      JSON.stringify({
        version: 3,
        notes: [
          { id: 'a', name: 'Projeto.md', body, revision: 0 },
          { id: 'b', name: 'Outra.md', body: '# Outra\n\ntexto', revision: 0 },
        ],
        trash: [],
        openIds: ['a', 'b'],
        activeId: 'a',
        preferences: { tabsVisible: true, language: 'pt-BR', theme: 'dark', fontSize: 16 },
      }),
    )
  }, body)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('o Quadro mostra colunas por status e raias por seção', async ({ page }) => {
  await mode(page, 'Quadro')
  const board = page.getByRole('region', { name: 'Quadro de tarefas' })
  await expect(board.getByRole('heading', { name: /Backend/ })).toBeVisible()
  await expect(board.getByRole('heading', { name: /Frontend/ })).toBeVisible()
  const first = board.locator('.board-lane').first()
  await expect(first.locator('[data-column="doing"]')).toContainText('Cache')
  await expect(first.locator('[data-column="done"]')).toContainText('API')
  await board.getByLabel('Agrupar por seção').uncheck()
  await expect(board.getByRole('heading', { name: /Backend/ })).toHaveCount(0)
  await expect(board.locator('.board-lane')).toHaveCount(1)
})

test('mover pelo menu muda o status e a seção no texto', async ({ page }) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Mover cartão: Fila' }).click()
  await page.getByRole('menuitemradio', { name: /Esperando/ }).click()
  await page.getByRole('button', { name: 'Mover cartão: Tela' }).click()
  await page.getByRole('menuitem', { name: 'Mover para a seção: Backend' }).click()
  await mode(page, 'Código')
  const text = await source(page).inputValue()
  expect(text).toContain('- [>] Fila')
  expect(text).toMatch(/## Backend[\s\S]*- \[ \] Tela[\s\S]*## Frontend/)
})

test('o botão + cria a tarefa na coluna e o desfazer do Quadro a remove', async ({ page }) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Adicionar tarefa em Fazendo' }).first().click()
  await page.getByLabel('Nova tarefa').fill('Escrever testes')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-column="doing"]').first()).toContainText('Escrever testes')
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect(page.getByText('Escrever testes')).toHaveCount(0)
})

test('o Quadro é lembrado por nota e uma nota sem tarefas mostra a lista vazia', async ({
  page,
}) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Outra.md', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Padrão', exact: true })).toBeChecked()
  await mode(page, 'Quadro')
  await expect(page.getByText('Esta nota ainda não tem tarefas.')).toBeVisible()
  await page.getByRole('button', { name: 'Adicionar tarefa' }).click()
  await page.getByLabel('Nova tarefa').fill('Primeira')
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-column="todo"]')).toContainText('Primeira')
  await page.getByRole('button', { name: 'Projeto.md', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Quadro', exact: true })).toBeChecked()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Quadro', exact: true })).toBeChecked()
})

test('arrastar um cartão entre colunas e raias muda o status e move a linha', async ({ page }) => {
  await mode(page, 'Quadro')
  const lanes = page.locator('.board-lane')
  await lanes
    .first()
    .locator('.board-card', { hasText: 'Fila' })
    .dragTo(lanes.first().locator('[data-column="waiting"]'))
  await lanes
    .first()
    .locator('.board-card', { hasText: 'Cache' })
    .dragTo(lanes.nth(1).locator('[data-column="done"]'))
  await mode(page, 'Código')
  const text = await source(page).inputValue()
  expect(text).toContain('- [>] Fila')
  expect(text).toMatch(/## Frontend[\s\S]*- \[x\] Cache[^\n]*\n\s+- \[ \] Redis/)
})
