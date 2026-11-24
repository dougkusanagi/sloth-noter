import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

const fixture = {
  ...newDocument(),
  notes: [
    {
      id: 'project',
      name: 'Projeto.md',
      body: '# Projeto\n\nIntrodução com café.\n\n## Metas\n\nTomar café e revisar metas.\n\n## Cronograma\n\nEntrega em março.',
      revision: 0,
    },
    {
      id: 'shopping',
      name: 'Compras.md',
      body: '# Compras\n\n## Mercado\n\n- [ ] Pão\n- [ ] Leite',
      revision: 0,
    },
  ],
  openIds: ['project'],
  activeId: 'project',
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

test('Buscar e comandos finds notes with match count, opens at 1st match, and creates missing notes', async ({
  page,
}) => {
  const trigger = page.getByRole('button', { name: 'Buscar e comandos', exact: true })
  await trigger.tap()
  const dialog = page.getByRole('dialog', { name: 'Buscar e comandos' })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole('searchbox', { name: 'Buscar e comandos' })
  await expect(input).toBeFocused()

  // Search by text: shows match count and snippet, and opens at 1st occurrence.
  await input.fill('café')
  const projectItem = dialog.getByRole('button', { name: /Projeto/ })
  await expect(projectItem).toContainText('2 ocorrências')
  await projectItem.tap()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('search')).toBeVisible()
  await expect(page.getByRole('search').locator('output')).toContainText('1/2')

  // Escape / close search, reopen via Ctrl+P, and create a note when there are no results.
  await page.keyboard.press('Control+p')
  await expect(dialog).toBeVisible()
  await input.fill('Ideia Nova')
  await dialog.getByRole('button', { name: /Criar nota “Ideia Nova”/ }).tap()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toContainText('Ideia Nova')
})

test('Buscar e comandos supports > commands, # headings, Ctrl+Shift+P, and Escape focus return', async ({
  page,
}) => {
  // On root list, Ctrl+Shift+P opens with '>' and hides note-only actions.
  await page.keyboard.press('Control+Shift+P')
  const dialog = page.getByRole('dialog', { name: 'Buscar e comandos' })
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole('searchbox', { name: 'Buscar e comandos' })
  await expect(input).toHaveValue('>')
  await expect(dialog.getByRole('button', { name: 'Configurações' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Modo código' })).toHaveCount(0)

  // Prefix '#' on root list shows headings across all notes and jumps into the note.
  await input.fill('#Cronograma')
  await dialog.getByRole('button', { name: /Cronograma/ }).tap()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Cronograma' })).toBeVisible()

  // Inside a note, '>' shows note-specific actions and '#' shows only the open note's headings.
  const trigger = page.getByRole('button', { name: 'Buscar e comandos', exact: true })
  await trigger.tap()
  await input.fill('#')
  await expect(dialog.getByRole('button', { name: 'Metas' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Mercado' })).toHaveCount(0)

  await input.fill('>Modo código')
  await dialog.getByRole('button', { name: 'Modo código' }).tap()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })).toBeVisible()

  // Escape closes the sheet cleanly.
  await page.getByRole('button', { name: 'Pronto' }).tap()
  await trigger.tap()
  await expect(input).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
