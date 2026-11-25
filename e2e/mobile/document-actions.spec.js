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
