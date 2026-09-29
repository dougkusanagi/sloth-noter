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
  await expect(page.getByRole('button', { name: 'Welcome.md' })).toBeVisible()
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
  await page.getByRole('button', { name: 'Main menu' }).click()
  await page.getByRole('menuitem', { name: /New note/ }).click()
  await editor(page).click()
  await page.keyboard.type('# Diário')
  await expect(page.getByRole('button', { name: 'Diário.md' })).toBeVisible()
})

test('find in note reports matches and closes with Escape', async ({ page }) => {
  await page.keyboard.press('Control+f')
  const dialog = page.getByRole('dialog', { name: 'Find in note' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Text to find').fill('Sloth')
  await expect(dialog.getByRole('status')).toContainText('match')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})

test('the note palette opens another note with the keyboard', async ({ page }) => {
  await page.getByRole('button', { name: 'Main menu' }).click()
  await page.getByRole('menuitem', { name: /New note/ }).click()
  await page.getByRole('button', { name: 'Main menu' }).click()
  await page.getByRole('menuitem', { name: /Find note/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Find note' })
  await dialog.getByLabel('Search notes').fill('Welcome')
  await page.keyboard.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: 'Welcome.md' })).toHaveClass(/active/)
})

test('a deleted note goes to the trash and can be restored', async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Main menu' }).click()
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click()
  await page.getByRole('button', { name: 'Main menu' }).click()
  await page.getByRole('menuitem', { name: /^Trash \(/ }).click()
  const trash = page.getByRole('dialog', { name: 'Trash' })
  await trash.getByRole('button', { name: 'Restore' }).click()
  await expect(trash).toBeHidden()
  await expect(page.getByRole('button', { name: 'Welcome.md' })).toBeVisible()
})
