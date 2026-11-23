import { expect, test } from '@playwright/test'

const body =
  '# Projeto\n\n## Backend\n\n- [x] API\n- [/] Cache\n    - [ ] Redis\n- [ ] Fila\n\n## Frontend\n\n- [ ] Tela\n'
const mode = (page, name) => page.getByRole('radio', { name, exact: true }).check({ force: true })
const source = (page) => page.locator('textarea')

/** Drags with the mouse; the last small move lets the browser see the drop slot that opened. */
async function drag(page, from, to, dy = 0) {
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await page.mouse.move(a.x + 20, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 20, b.y + (dy || b.height / 2), { steps: 8 })
  await page.mouse.move(b.x + 24, b.y + (dy || b.height / 2) + 2, { steps: 2 })
  await page.mouse.up()
}

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

test('o Quadro é lembrado por nota e uma nota sem tarefas mostra as colunas vazias', async ({
  page,
}) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Outra.md', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Padrão', exact: true })).toBeChecked()
  await mode(page, 'Quadro')
  // Without tasks the board still shows its columns, each ready to take the first task.
  await expect(page.locator('.board-column')).toHaveCount(4)
  await page.getByRole('button', { name: 'Adicionar tarefa em Fazer' }).click()
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
  await drag(
    page,
    lanes.first().locator('.board-card', { hasText: 'Fila' }),
    lanes.first().locator('[data-column="waiting"]'),
  )
  await expect(lanes.first().locator('[data-column="waiting"]')).toContainText('Fila')
  await drag(
    page,
    lanes.first().locator('.board-card', { hasText: 'Cache' }),
    lanes.nth(1).locator('[data-column="done"]'),
  )
  await expect(lanes.nth(1).locator('[data-column="done"]')).toContainText('Cache')
  await mode(page, 'Código')
  const text = await source(page).inputValue()
  expect(text).toContain('- [>] Fila')
  expect(text).toMatch(/## Frontend[\s\S]*- \[x\] Cache[^\n]*\n\s+- \[ \] Redis/)
})

test('arrastar mostra o espaço de encaixe e reordena dentro da coluna', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mode(page, 'Código')
  await source(page).fill('# Projeto\n\n## Etapa\n\n- [ ] Um\n- [ ] Dois\n- [ ] Três\n')
  await mode(page, 'Quadro')
  const column = page.locator('[data-column="todo"]').first()
  const card = (text) => column.locator('.board-card', { hasText: text })
  const from = await card('Três').boundingBox()
  const to = await card('Um').boundingBox()
  await page.mouse.move(from.x + 20, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + 20, to.y + 8, { steps: 8 })
  await expect(column.locator('.board-drop-slot')).toBeVisible()
  await expect(card('Três')).toHaveAttribute('data-dragged', 'true')
  await page.screenshot({ path: test.info().outputPath('board-drag.png') })
  await page.mouse.move(to.x + 24, to.y + 10, { steps: 2 })
  await page.mouse.up()
  await expect(column.locator('.board-drop-slot')).toHaveCount(0)
  await expect(column.locator('.board-card-text')).toHaveText(['Três', 'Um', 'Dois'])
  await mode(page, 'Código')
  expect(await source(page).inputValue()).toContain('- [ ] Três\n- [ ] Um\n- [ ] Dois')
})

test('clicar no texto do cartão permite editá-lo', async ({ page }) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Editar tarefa: Fila' }).click()
  const input = page.getByRole('textbox', { name: 'Texto da tarefa' })
  // The editor keeps the card's size instead of taking the source editor's full height.
  expect((await input.boundingBox()).height).toBeLessThan(60)
  await input.fill('Fila de e-mails')
  await input.press('Enter')
  await expect(page.locator('.board-card', { hasText: 'Fila de e-mails' })).toBeVisible()
  await page.getByRole('button', { name: 'Editar tarefa: Tela' }).click()
  await page.getByRole('textbox', { name: 'Texto da tarefa' }).fill('Outro')
  await page.keyboard.press('Escape')
  await mode(page, 'Código')
  const text = await source(page).inputValue()
  expect(text).toContain('- [ ] Fila de e-mails')
  expect(text).toContain('- [ ] Tela')
})
