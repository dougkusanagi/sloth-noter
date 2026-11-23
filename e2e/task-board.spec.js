import { expect, test } from '@playwright/test'

// A task note (ADR 0033): each H2 section is a column.
const body =
  '---\ntipo: tarefas\n---\n# Projeto\n\n## Fazer\n\n- [ ] Fila\n- [ ] Tela\n\n## Fazendo\n\n- [/] Cache\n    - [ ] Redis\n\n## Revisão\n\n## Feito\n\n- [x] API\n'
const mode = (page, name) => page.getByRole('radio', { name, exact: true }).check({ force: true })
const source = (page) => page.locator('textarea')
const column = (page, title) =>
  page.locator('.board-column').filter({
    has: page.locator('.board-column-title', { hasText: new RegExp(`^${title}$`) }),
  })

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
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript((body) => {
    if (localStorage.getItem('sloth-note:v3')) return
    localStorage.setItem(
      'sloth-note:v3',
      JSON.stringify({
        version: 3,
        notes: [
          { id: 'a', name: 'Projeto.md', body, revision: 0 },
          { id: 'b', name: 'Outra.md', body: '# Outra\n\ntexto', revision: 0 },
          {
            id: 'c',
            name: 'Etapa.md',
            body: '---\ntipo: tarefas\n---\n# Etapa\n\n## Etapa\n\n- [ ] Um\n- [ ] Dois\n- [ ] Três\n',
            revision: 0,
          },
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

test('as colunas do Quadro são as seções da nota de tarefas', async ({ page }) => {
  await mode(page, 'Quadro')
  await expect(page.locator('.board-column-title')).toHaveText([
    'Fazer',
    'Fazendo',
    'Revisão',
    'Feito',
  ])
  await expect(column(page, 'Fazendo')).toContainText('Cache')
  await expect(column(page, 'Feito')).toContainText('API')
  await expect(column(page, 'Revisão')).toContainText('Nenhuma tarefa')
  // The toolbar stays in view even when the columns need to scroll.
  await expect(page.getByRole('button', { name: 'Desfazer' })).toBeInViewport({ ratio: 1 })
  await page.screenshot({ path: test.info().outputPath('board.png') })
})

test('mover pelo menu leva a tarefa para a seção e acerta o status', async ({ page }) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Mover cartão: Fila' }).click()
  await page.getByRole('menuitem', { name: 'Mover para Feito' }).click()
  await page.getByRole('button', { name: 'Mover cartão: Tela' }).click()
  await page.getByRole('menuitem', { name: 'Mover para Revisão' }).click()
  // Changing only the status keeps the card in its column.
  await page.getByRole('button', { name: 'Mover cartão: Cache' }).click()
  await page.getByRole('menuitemradio', { name: /Esperando/ }).click()
  await expect(column(page, 'Fazendo')).toContainText('Cache')
  await mode(page, 'Código')
  const text = await source(page).inputValue()
  expect(text).toMatch(/## Revisão\n\n- \[ \] Tela\n/)
  expect(text).toMatch(/## Feito\n\n- \[x\] API\n- \[x\] Fila/)
  expect(text).toContain('- [>] Cache')
})

test('o botão + cria a tarefa na coluna e o desfazer do Quadro a remove', async ({ page }) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Adicionar tarefa em Fazendo' }).click()
  await page.getByLabel('Nova tarefa').fill('Escrever testes')
  await page.keyboard.press('Enter')
  await expect(column(page, 'Fazendo')).toContainText('Escrever testes')
  await page.getByRole('button', { name: 'Desfazer' }).click()
  await expect(page.getByText('Escrever testes')).toHaveCount(0)
  await page.getByRole('button', { name: 'Adicionar tarefa em Fazendo' }).click()
  await page.getByLabel('Nova tarefa').fill('Escrever testes')
  await page.keyboard.press('Enter')
  await mode(page, 'Código')
  expect(await source(page).inputValue()).toContain('- [/] Escrever testes')
})

test('uma nota comum vira nota de tarefas pelo Quadro, que é lembrado por nota', async ({
  page,
}) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Outra.md', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Padrão', exact: true })).toBeChecked()
  await mode(page, 'Quadro')
  await expect(page.getByText('O Quadro mostra notas de tarefas')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('board-convert.png') })
  await page.getByRole('button', { name: 'Transformar em nota de tarefas' }).click()
  await expect(page.locator('.board-column-title')).toHaveText([
    'Fazer',
    'Fazendo',
    'Esperando',
    'Feito',
  ])
  await page.getByRole('button', { name: 'Adicionar tarefa em Fazer' }).click()
  await page.getByLabel('Nova tarefa').fill('Primeira')
  await page.keyboard.press('Enter')
  await expect(column(page, 'Fazer')).toContainText('Primeira')
  await mode(page, 'Código')
  expect(await source(page).inputValue()).toMatch(
    /^---\ntipo: tarefas\ncriada: \d{4}-\d{2}-\d{2}\n---\n# Outra\n\ntexto\n\n## Fazer\n\n- \[ \] Primeira\n/,
  )
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Projeto.md', exact: true }).click()
  await expect(page.getByRole('radio', { name: 'Quadro', exact: true })).toBeChecked()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Quadro', exact: true })).toBeChecked()
})

test('arrastar um cartão para outra coluna move a linha e acerta o status', async ({ page }) => {
  await mode(page, 'Quadro')
  await drag(
    page,
    column(page, 'Fazendo').locator('.board-card', { hasText: 'Cache' }),
    column(page, 'Feito'),
    // Below the last card: the end of the column.
    (await column(page, 'Feito').boundingBox()).height - 6,
  )
  await expect(column(page, 'Feito')).toContainText('Cache')
  await drag(
    page,
    column(page, 'Fazer').locator('.board-card', { hasText: 'Fila' }),
    column(page, 'Revisão'),
  )
  await expect(column(page, 'Revisão')).toContainText('Fila')
  await mode(page, 'Código')
  const text = await source(page).inputValue()
  expect(text).toMatch(/## Revisão\n\n- \[ \] Fila\n/)
  expect(text).toMatch(/## Feito\n\n- \[x\] API\n- \[x\] Cache[^\n]*\n\s+- \[ \] Redis/)
})

test('arrastar mostra o espaço de encaixe e reordena dentro da coluna', async ({ page }) => {
  await page.getByRole('button', { name: 'Etapa', exact: true }).first().click()
  await mode(page, 'Quadro')
  const etapa = column(page, 'Etapa')
  const card = (text) => etapa.locator('.board-card', { hasText: text })
  const from = await card('Três').boundingBox()
  const to = await card('Um').boundingBox()
  await page.mouse.move(from.x + 20, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + 20, to.y + 8, { steps: 8 })
  await expect(etapa.locator('.board-drop-slot')).toBeVisible()
  await expect(card('Três')).toHaveAttribute('data-dragged', 'true')
  await page.mouse.move(to.x + 24, to.y + 10, { steps: 2 })
  await page.mouse.up()
  await expect(etapa.locator('.board-drop-slot')).toHaveCount(0)
  await expect(etapa.locator('.board-card-text')).toHaveText(['Três', 'Um', 'Dois'])
  await mode(page, 'Código')
  expect(await source(page).inputValue()).toContain('- [ ] Três\n- [ ] Um\n- [ ] Dois')
})

test('Arquivar concluídas leva as tarefas feitas para a seção Arquivo', async ({ page }) => {
  await mode(page, 'Quadro')
  await page.getByRole('button', { name: 'Arquivar concluídas' }).click()
  await expect(page.getByRole('status')).toContainText('Tarefas arquivadas: 1')
  await expect(column(page, 'Feito')).not.toContainText('API')
  await expect(page.locator('.board-column-title')).not.toContainText(['Arquivo'])
  await mode(page, 'Código')
  expect(await source(page).inputValue()).toMatch(/## Arquivo\n[\s\S]*- \[x\] API/)
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
