import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

const body =
  '---\ntipo: tarefas\n---\n# Projeto\n\n## Fazer\n\n- [ ] Fila\n- [ ] Tela\n\n## Fazendo\n\n- [/] Cache com um texto bem longo que precisa quebrar em várias linhas no celular\n\n## Esperando\n\n## Feito\n\n- [x] API\n'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, doc }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
    },
    {
      key: STORAGE_KEY,
      doc: {
        ...newDocument(),
        notes: [{ id: 'a', name: 'Projeto.md', body, revision: 0 }],
        openIds: ['a'],
        activeId: 'a',
      },
    },
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="a"]').click()
})

test('o Quadro no celular mostra uma coluna por vez, com abas por seção', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver como quadro' }).click()
  const board = page.getByRole('region', { name: 'Quadro de tarefas' })
  await expect(board.getByRole('tab', { name: /Fazer/ })).toHaveAttribute('aria-selected', 'true')
  await expect(board.getByText('Fila')).toBeVisible()
  await expect(board.getByText('Cache')).toHaveCount(0)
  await board.getByRole('tab', { name: /Fazendo/ }).click()
  await expect(board.getByText('Cache com um texto')).toBeVisible()
  await expect(board.getByText('Fila')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('mobile-board.png') })
  // Every touch target is at least 44 px.
  for (const target of [
    board.getByRole('tab').first(),
    board.locator('.board-card-menu').first(),
  ]) {
    const box = await target.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test('o cartão muda de seção pelo menu e a escolha é lembrada por nota', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver como quadro' }).click()
  await page.getByRole('button', { name: 'Mover cartão: Fila' }).click()
  await page.getByRole('menuitem', { name: 'Mover para Esperando' }).click()
  await expect(page.getByText('Fila')).toHaveCount(0)
  await page.getByRole('tab', { name: /Esperando/ }).click()
  await expect(page.getByText('Fila')).toBeVisible()
  await page.reload()
  // The app may reopen on the note itself or on the list, depending on the saved navigation.
  const row = page.locator('[data-note-id="a"]')
  if (await row.isVisible().catch(() => false)) await row.click()
  await expect(page.getByRole('region', { name: 'Quadro de tarefas' })).toBeVisible()
  await page.getByRole('button', { name: 'Ver como nota' }).click()
  await expect(page.locator('.markdown')).toContainText('Fila')
})

test('a opção Data ao fechar tarefas vale no Quadro e na Leitura do celular', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver como quadro' }).click()
  await page.getByRole('button', { name: 'Mover cartão: Fila' }).click()
  await page.getByRole('menuitem', { name: 'Mover para Feito' }).click()
  await page.getByRole('tab', { name: /Feito/ }).click()
  await expect(page.locator('.board-card', { hasText: 'Fila' })).toContainText(
    /✅ \d{4}-\d{2}-\d{2}/,
  )

  await page.getByRole('button', { name: 'Mais opções' }).click()
  await page.getByRole('button', { name: 'Configurações' }).click()
  await page.getByRole('switch', { name: /Data ao fechar tarefas/ }).uncheck()
  await page.getByRole('button', { name: 'Voltar' }).click()
  await page.getByRole('button', { name: 'Fechar' }).click()

  await page.getByRole('tab', { name: /Fazer/ }).click()
  await page.getByRole('button', { name: 'Mover cartão: Tela' }).click()
  await page.getByRole('menuitem', { name: 'Mover para Feito' }).click()
  await page.getByRole('tab', { name: /Feito/ }).click()
  const tela = page.locator('.board-card', { hasText: 'Tela' })
  await expect(tela).toBeVisible()
  await expect(tela).not.toContainText('✅')

  await page.getByRole('button', { name: 'Ver como nota' }).click()
  const saved = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)).notes[0].body,
    STORAGE_KEY,
  )
  expect(saved).toMatch(/- \[x\] Fila ✅ \d{4}-\d{2}-\d{2}/)
  expect(saved).toContain('- [x] Tela\n')
})
