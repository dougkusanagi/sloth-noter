import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

const fixture = {
  ...newDocument(),
  notes: [
    {
      id: 'alpha',
      name: 'Alpha.md',
      body: '# Alpha\n\nConteúdo da nota Alpha.',
      revision: 0,
    },
    {
      id: 'beta',
      name: 'Beta.md',
      body: '# Beta\n\nConteúdo da nota Beta.',
      revision: 0,
    },
    {
      id: 'gamma',
      name: 'Gamma.md',
      body: '# Gamma\n\nConteúdo da nota Gamma.',
      revision: 0,
    },
  ],
  openIds: ['alpha', 'beta'],
  activeId: 'alpha',
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ({ key, doc }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(doc))
    },
    { key: STORAGE_KEY, doc: fixture },
  )
  await page.goto('/?platform=mobile')
})

test('Open notes sheet switches notes preserving mode, closes notes without deleting, and persists openIds', async ({
  page,
}) => {
  // Open Alpha and enter edit mode.
  await page.locator('[data-note-id="alpha"]').tap()
  await page.getByRole('button', { name: 'Editar', exact: true }).tap()
  await expect(page.locator('.cm-content')).toBeVisible()

  // Tap the title in the header to open the Notas abertas sheet.
  await page.getByRole('button', { name: /Alpha — Notas abertas/ }).tap()
  const dialog = page.getByRole('dialog', { name: 'Notas abertas' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Alpha', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  )

  // Switch to Beta (should open in reading mode).
  await dialog.getByRole('button', { name: 'Beta', exact: true }).tap()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toHaveCount(0)
  await expect(page.getByText('Conteúdo da nota Beta.')).toBeVisible()

  // Switch back to Alpha: editing mode is preserved.
  await page.getByRole('button', { name: /Beta — Notas abertas/ }).tap()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Alpha', exact: true }).tap()
  await expect(page.locator('.cm-content')).toBeVisible()

  // Open Gamma from the list so it is added to openIds, then close others.
  await page.getByRole('button', { name: 'Notas', exact: true }).tap()
  await page.locator('[data-note-id="gamma"]').tap()

  await page.getByRole('button', { name: /Gamma — Notas abertas/ }).tap()
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Alpha', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Beta', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Gamma', exact: true })).toBeVisible()

  // Close Beta individually.
  await dialog.getByRole('button', { name: 'Fechar Beta', exact: true }).tap()
  await expect(dialog.getByRole('button', { name: 'Beta', exact: true })).toHaveCount(0)

  // Close others (keeps only Gamma).
  await dialog.getByRole('button', { name: 'Fechar as outras', exact: true }).tap()
  await expect(dialog).toBeHidden()

  // Reload and verify openIds persisted and no note was deleted.
  await page.reload()
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)
  expect(stored.openIds).toEqual(['gamma'])
  expect(stored.notes.map((note) => note.id).sort()).toEqual(['alpha', 'beta', 'gamma'])
})
