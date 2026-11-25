import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

const fixture = {
  ...newDocument(),
  groups: ['Trabalho', 'Pessoal'],
  notes: [
    {
      id: 'zeta',
      name: 'Zeta.md',
      body: '# Zeta\n\nNota solta recente.',
      revision: 0,
    },
    {
      id: 'alfa',
      name: 'Alfa.md',
      body: '# Alfa\n\nOutra nota solta.',
      revision: 0,
    },
    {
      id: 'sprint',
      name: 'Sprint.md',
      body: '# Sprint\n\nPlanejamento semanal.',
      group: 'Trabalho',
      revision: 0,
    },
    {
      id: 'receita',
      name: 'Receita.md',
      body: '# Receita\n\nBolo de cenoura.',
      group: 'Pessoal',
      revision: 0,
    },
  ],
  openIds: ['zeta'],
  activeId: 'zeta',
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

test('desktop groups are collapsible and search hides groups without matches', async ({ page }) => {
  const workGroup = page.locator('details.mobile-group', { hasText: 'Trabalho' })
  const personalGroup = page.locator('details.mobile-group', { hasText: 'Pessoal' })
  const sprintNote = workGroup.locator('[data-note-id="sprint"]')
  await expect(workGroup).toBeVisible()
  await expect(personalGroup).toBeVisible()
  await expect(sprintNote).toBeVisible()

  // Collapsing a group hides its notes.
  await workGroup.locator('summary').tap()
  await expect(sprintNote).toBeHidden()
  await workGroup.locator('summary').tap()
  await expect(sprintNote).toBeVisible()

  // Search shows only groups with matches.
  await page.getByRole('button', { name: 'Buscar nas notas', exact: true }).tap()
  await page.getByRole('searchbox', { name: 'Buscar nas notas' }).fill('cenoura')
  await expect(personalGroup).toBeVisible()
  await expect(workGroup).toHaveCount(0)
})

test('sort toggle switches between recent and alphabetical and action sheet moves a note between groups', async ({
  page,
}) => {
  const looseButtons = page.locator('.mobile-notes > :not(details):not(h2) [data-note-id]')
  await expect(looseButtons.nth(0)).toContainText('Zeta')
  await expect(looseButtons.nth(1)).toContainText('Alfa')

  // Switch to alphabetical sort.
  const sortButton = page.getByRole('button', { name: 'Ordenar notas', exact: true })
  await sortButton.tap()
  await expect(sortButton).toHaveAttribute('aria-pressed', 'true')
  await expect(looseButtons.nth(0)).toContainText('Alfa')
  await expect(looseButtons.nth(1)).toContainText('Zeta')

  // Move Alfa into Trabalho via the note actions sheet.
  await page.getByRole('button', { name: 'Ações de Alfa', exact: true }).tap()
  await page.getByRole('button', { name: 'Mover para pasta', exact: true }).tap()
  const groupDialog = page.getByRole('dialog', { name: 'Mover para pasta' })
  await expect(groupDialog).toBeVisible()
  await groupDialog.getByRole('button', { name: 'Trabalho', exact: true }).tap()

  const workGroup = page.locator('details.mobile-group', { hasText: 'Trabalho' })
  await expect(workGroup.locator('[data-note-id="alfa"]')).toBeVisible()
  await expect(looseButtons).toHaveCount(1)
})
