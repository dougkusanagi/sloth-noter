import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

const body =
  '# Projeto\n\n## Backend\n\n- [x] API\n- [/] Cache com um texto bem longo que precisa quebrar em várias linhas no celular\n- [ ] Fila\n\n## Frontend\n\n- [ ] Tela\n'

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

test('o Quadro no celular mostra uma coluna por vez, com abas por status', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver como quadro' }).click()
  const board = page.getByRole('region', { name: 'Quadro de tarefas' })
  await expect(board.getByRole('tab', { name: /A fazer/ })).toHaveAttribute('aria-selected', 'true')
  await expect(board.getByText('Fila')).toBeVisible()
  await expect(board.getByText('Cache')).toHaveCount(0)
  await board.getByRole('tab', { name: /Fazendo/ }).click()
  await expect(board.getByText('Cache com um texto')).toBeVisible()
  await expect(board.getByText('Fila')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/mobile-board.png' })
  // Every touch target is at least 44 px.
  for (const target of [
    board.getByRole('tab').first(),
    board.locator('.board-card-menu').first(),
  ]) {
    const box = await target.boundingBox()
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
})

test('o status muda pelo menu do cartão e a escolha é lembrada por nota', async ({ page }) => {
  await page.getByRole('button', { name: 'Ver como quadro' }).click()
  await page.getByRole('button', { name: 'Mover cartão: Fila' }).click()
  await page.getByRole('menuitemradio', { name: /Esperando/ }).click()
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
