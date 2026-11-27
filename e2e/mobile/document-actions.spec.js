import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

const fixture = {
  ...newDocument(),
  notes: [
    {
      id: 'doc',
      name: 'Relatório.md',
      body: '# Relatório\n\n## Primeira\n\nTexto alfa e alfa.\n\n## Segunda\n\nTexto beta.',
      revision: 0,
    },
  ],
  openIds: ['doc'],
  activeId: 'doc',
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, doc }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
    },
    { key: STORAGE_KEY, doc: fixture },
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="doc"]').tap()
})

test('Find and replace in editing mode replaces matches and supports Undo', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await expect(page.locator('.cm-content')).toBeVisible()

  await page.getByRole('button', { name: 'Buscar na nota', exact: true }).tap()
  const searchBar = page.getByRole('search', { name: 'Buscar na nota' })
  await expect(searchBar).toBeVisible()
  await searchBar.getByRole('searchbox', { name: 'Texto a buscar' }).fill('alfa')
  await expect(searchBar.locator('output')).toContainText('1/2')

  await searchBar.getByRole('textbox', { name: 'Substituir por…' }).fill('gama')
  await searchBar.getByRole('button', { name: 'Substituir tudo', exact: true }).tap()
  await expect(page.locator('.cm-content')).toContainText('Texto gama e gama.')

  // Undo reverts the single-transaction replaceAll.
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+z')
  await expect(page.locator('.cm-content')).toContainText('Texto alfa e alfa.')
})

test('Information, fold/unfold all, and move section with undo work from note actions', async ({
  page,
}) => {
  // Information sheet shows textStatistics values.
  await page.getByRole('button', { name: 'Ações de Relatório', exact: true }).tap()
  await page.getByRole('button', { name: 'Informações', exact: true }).tap()
  const infoDialog = page.getByRole('dialog', { name: 'Informações' })
  await expect(infoDialog).toBeVisible()
  await expect(infoDialog).toContainText('Palavras')
  await expect(infoDialog).toContainText('Caracteres')
  await infoDialog.getByRole('button', { name: 'Fechar', exact: true }).tap()

  // Closing Info returns to the actions sheet, where Fold all is already available.
  await page.getByRole('button', { name: 'Recolher todas as seções', exact: true }).tap()
  await expect(page.getByText('Texto alfa e alfa.')).toBeHidden()
  await expect(page.getByText('Texto beta.')).toBeHidden()

  await page.getByRole('button', { name: 'Ações de Relatório', exact: true }).tap()
  await page.getByRole('button', { name: 'Expandir todas as seções', exact: true }).tap()
  await expect(page.getByText('Texto alfa e alfa.')).toBeVisible()
  await expect(page.getByText('Texto beta.')).toBeVisible()

  // Move section reorders Segunda above Primeira and offers Undo.
  await page.getByRole('button', { name: 'Ações de Relatório', exact: true }).tap()
  await page.getByRole('button', { name: 'Mover seção', exact: true }).tap()
  const sectionsDialog = page.getByRole('dialog', { name: 'Mover seção' })
  await expect(sectionsDialog).toBeVisible()
  await sectionsDialog.getByRole('button', { name: 'Mover para cima: Segunda' }).tap()

  const headings = page.locator('.mobile-content h2')
  await expect(headings.nth(0)).toHaveText('Segunda')
  await expect(headings.nth(1)).toHaveText('Primeira')

  // Undo restores original order.
  await page.getByRole('button', { name: 'Desfazer', exact: true }).click()
  await expect(headings.nth(0)).toHaveText('Primeira')
  await expect(headings.nth(1)).toHaveText('Segunda')
})

test('Reorder blocks moves blocks with arrows, by dragging, and undoes the last move', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Ações de Relatório', exact: true }).tap()
  await page.getByRole('button', { name: 'Reordenar blocos', exact: true }).tap()
  const sheet = page.getByRole('dialog', { name: 'Reordenar blocos' })
  await expect(sheet).toBeVisible()
  const labels = sheet.locator('.mobile-reorder-label')
  await expect(labels).toHaveText(['Primeira', 'Texto alfa e alfa.', 'Segunda', 'Texto beta.'])

  await sheet.getByRole('button', { name: 'Mover para baixo: Texto alfa e alfa.' }).tap()
  await expect(labels).toHaveText(['Primeira', 'Segunda', 'Texto alfa e alfa.', 'Texto beta.'])
  await expect(sheet.getByRole('status')).toHaveText('Bloco movido para a posição 3 de 4.')

  await sheet.getByRole('button', { name: 'Desfazer', exact: true }).tap()
  await expect(labels).toHaveText(['Primeira', 'Texto alfa e alfa.', 'Segunda', 'Texto beta.'])

  // Dragging the last card by its handle to the top.
  const grip = sheet.locator('.mobile-reorder-grip').nth(3)
  const from = await grip.boundingBox()
  const to = await sheet.locator('.mobile-reorder-item').first().boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  for (let step = 1; step <= 8; step++)
    await page.mouse.move(
      from.x + from.width / 2,
      from.y + from.height / 2 + ((to.y + 4 - from.y - from.height / 2) * step) / 8,
    )
  await page.mouse.up()
  await expect(labels).toHaveText(['Texto beta.', 'Primeira', 'Texto alfa e alfa.', 'Segunda'])

  await sheet.getByRole('button', { name: 'Fechar', exact: true }).tap()
  await expect(page.locator('.markdown')).toContainText(/Texto beta\.[\s\S]*Primeira/)
})
