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

test('2-column table fits mobile viewport width cleanly without horizontal overflow', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const tableMd = [
    '| Referência antiga | Divergência ou dúvida |',
    '| --- | --- |',
    '| 103 | Antigo: escura com nervura e tampa lateral. Novo: azul escuro estonado. |',
    '| 207 e 208 | Ambos mencionam fenda e recorte. Não dá para distinguir os novos modelos. |',
    '| 218 | Antigo: marmorizado com bolso embutido e elo, sem cor definida. Novo: preto marmorizado. |',
  ].join('\n')
  const fixture = {
    ...newDocument(),
    preferences: { ...newDocument().preferences, theme: 'dark' },
    notes: [
      {
        id: 'div',
        name: 'Divergências.md',
        body: `# Divergências\n\n${tableMd}\n`,
        revision: 0,
      },
    ],
    openIds: ['div'],
    activeId: 'div',
  }
  await page.addInitScript(
    ([key, data]) => {
      localStorage.setItem(key, JSON.stringify(data))
    },
    [STORAGE_KEY, fixture],
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="div"]').tap()
  const wrap = page.locator('.mobile-table-wrap')
  await expect(wrap).toBeVisible()
  const fits = await wrap.evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  expect(fits).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mobile-table-2col-dark.png') })
  if (process.env.CAPTURE_UI) {
    await page.screenshot({ path: '/tmp/sloth-mobile-table-2col-dark.png' })
  }
})
