import { expect, test } from '@playwright/test'

const editor = (page) => page.locator('.cm-content')

async function typeAtEnd(page, text) {
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(text)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(editor(page)).toBeVisible()
})

test('a fresh install opens the welcome note', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Welcome.md', exact: true })).toBeVisible()
})

test('typed text survives a reload', async ({ page }) => {
  await typeAtEnd(page, '\nTexto persistido: açaí 🦥')
  await page.reload()
  // CodeMirror only renders visible lines, so scroll to the end first.
  await editor(page).click()
  await page.keyboard.press('Control+End')
  await expect(editor(page)).toContainText('Texto persistido: açaí 🦥')
})

test('a new note is named after its first H1', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: /Nova nota/ }).click()
  await editor(page).click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type('Diário')
  await expect(page.getByRole('button', { name: 'Diário.md', exact: true })).toBeVisible()
})

test('find in note reports matches and closes with Escape', async ({ page }) => {
  await page.keyboard.press('Control+f')
  const dialog = page.getByRole('dialog', { name: 'Buscar na nota' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Texto a buscar').fill('Sloth')
  await expect(dialog.getByRole('status')).toContainText('ocorrência')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('the note palette opens another note with the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: /Nova nota/ }).click()
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: /Buscar nota/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Buscar nota' })
  await dialog.getByLabel('Buscar notas').fill('Welcome')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Welcome.md', exact: true })).toHaveClass(/active/)
})

test('a deleted note goes to the trash and can be restored', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mover' }).click()
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: /^Lixeira \(/ }).click()
  const trash = page.getByRole('dialog', { name: 'Lixeira' })
  await trash.getByRole('button', { name: 'Restaurar' }).click()
  await expect(trash).toBeHidden()
  await expect(page.getByRole('button', { name: 'Welcome.md', exact: true })).toBeVisible()
})

test('renaming uses an in-app dialog and the tab follows', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: 'Renomear nota' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nome da nota' })
  await dialog.getByRole('textbox').fill('Ideias')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Ideias.md', exact: true })).toBeVisible()
})

test('the language can be switched to English and is remembered', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR')
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: /Idioma/ }).click()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.getByRole('button', { name: 'Main menu' }).click()
  await expect(page.getByRole('menuitem', { name: /New note/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Main menu' })).toBeVisible()
})
