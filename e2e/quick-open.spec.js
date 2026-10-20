import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

test.beforeEach(async ({ page }) => {
  const document = {
    ...newDocument(),
    notes: ['Arquivo', 'Alpha', 'Beta', 'Gamma'].map((id) => ({
      id,
      name: `${id}.md`,
      body: `# ${id}\n\nConteúdo`,
      revision: 1,
    })),
    openIds: ['Gamma', 'Alpha', 'Beta'],
    activeId: 'Alpha',
  }
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    { key: STORAGE_KEY, document },
  )
  await page.goto('/')
})

test('Ctrl+P shows open tabs in their order and keeps other notes searchable', async ({ page }) => {
  await page.keyboard.press('Control+p')
  const dialog = page.getByRole('dialog', { name: 'Buscar nota', exact: true })
  await expect(dialog.locator('.palette-note-name')).toHaveText([
    'Gamma',
    'Alpha',
    'Beta',
    'Arquivo',
  ])
  await expect(dialog.locator('.palette-group-label')).toHaveText(['Abas abertas', 'Outras notas'])
  await expect(dialog.locator('.menu-shortcut')).toHaveCount(3)
  await dialog.getByRole('textbox').fill('Arquivo')
  await page.keyboard.press('Enter')
  await expect(page.locator('.tab.active')).toHaveText('Arquivo.md')
})

test('number shortcuts switch tabs from the editor and palette even with tabs hidden', async ({
  page,
}) => {
  await page.keyboard.press('Control+3')
  await expect(page.locator('.tab.active')).toHaveText('Beta.md')
  await page.keyboard.press('Control+p')
  await page.keyboard.press('Control+1')
  await expect(page.getByRole('dialog', { name: 'Buscar nota', exact: true })).toHaveCount(0)
  await expect(page.locator('.tab.active')).toHaveText('Gamma.md')
  await page.keyboard.press('Control+9')
  await expect(page.locator('.tab.active')).toHaveText('Gamma.md')
  await page.keyboard.press('Control+,')
  await page.getByRole('switch', { name: 'Mostrar abas', exact: false }).uncheck()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+2')
  await expect(page.locator('.cm-content')).toContainText('Alpha')
})
