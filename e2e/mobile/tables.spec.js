import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

test('tables support cards view, fullscreen, identical tables and grid insertion', async ({
  page,
}) => {
  const tableMd = [
    '| Item | Status | Dono | Nota |',
    '| --- | --- | --- | --- |',
    '| Alpha | Feito | Ana | Primeira |',
    '| Beta | Pendente | Bruno | Segunda |',
  ].join('\n')
  const fixture = {
    ...newDocument(),
    notes: [
      {
        id: 'tbl',
        name: 'Tabelas.md',
        body: `# Tabelas\n\n${tableMd}\n\n${tableMd}\n`,
        revision: 0,
      },
    ],
    openIds: ['tbl'],
    activeId: 'tbl',
  }
  await page.addInitScript(
    ([key, data]) => {
      localStorage.setItem(key, JSON.stringify(data))
    },
    [STORAGE_KEY, fixture],
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="tbl"]').tap()

  // Two identical tables each have their own toolbar with row/col count
  const metas = page.locator('.mobile-table-meta', { hasText: '2 linhas · 4 colunas' })
  await expect(metas).toHaveCount(2)

  // Toggle first table to cards; second stays as table
  const blocks = page.locator('.mobile-table-block')
  await blocks.nth(0).getByRole('button', { name: 'Ver cartões' }).click()
  await expect(blocks.nth(0).locator('.mobile-table-card')).toHaveCount(2)
  await expect(blocks.nth(0).locator('.mobile-table-card').first()).toContainText('Alpha')
  await expect(blocks.nth(1).locator('table')).toBeVisible()

  // Open fullscreen on second table and return
  await blocks.nth(1).getByRole('button', { name: 'Tela cheia' }).click()
  const dialog = page.getByRole('dialog', { name: '2 linhas · 4 colunas' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Voltar' }).click()
  await expect(dialog).toBeHidden()

  // Edit mode: insert a 3 × 4 table via Inserir -> Tabela
  await page.getByRole('button', { name: 'Editar' }).tap()
  await page.locator('.cm-content').tap()
  await page.keyboard.press('ControlOrMeta+End')
  await page.evaluate(() => window.__insets?.({ top: 32, bottom: 24, ime: 300, keyboard: 'open' }))
  await page.getByRole('button', { name: 'Inserir', exact: true }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Tabela', exact: true }).tap()
  await page.getByRole('dialog').getByRole('button', { name: '3 × 4', exact: true }).tap()
  await expect(page.locator('.cm-content')).toContainText('Coluna 4')
})
