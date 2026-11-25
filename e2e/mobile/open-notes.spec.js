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

test('recently opened notes move to the top by default and can still toggle to alphabetical order', async ({
  page,
}) => {
  const rows = page.locator('.mobile-note-open')

  // Opening Gamma moves it to the top of the recent list, with a clean note title in the header.
  await page.locator('[data-note-id="gamma"]').tap()
  await expect(page.locator('.mobile-header h1')).toHaveText('Gamma')
  await expect(page.locator('.mobile-open-count')).toHaveCount(0)

  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(rows.nth(0)).toContainText('Gamma')

  // Opening Beta moves Beta ahead of Gamma.
  await page.locator('[data-note-id="beta"]').tap()
  await page.getByRole('button', { name: 'Voltar', exact: true }).tap()
  await expect(rows.nth(0)).toContainText('Beta')
  await expect(rows.nth(1)).toContainText('Gamma')

  // Toggling sort switches to alphabetical order and back to recent order.
  const sortButton = page.getByRole('button', { name: 'Ordenar notas' })
  await sortButton.tap()
  await expect(rows.nth(0)).toContainText('Alpha')
  await expect(rows.nth(1)).toContainText('Beta')
  await expect(rows.nth(2)).toContainText('Gamma')

  await sortButton.tap()
  await expect(rows.nth(0)).toContainText('Beta')
  await expect(rows.nth(1)).toContainText('Gamma')
})
