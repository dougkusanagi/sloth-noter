import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'
import { welcomeBody } from '../src/welcome.js'

const sourceBox = (page) =>
  page.getByRole('textbox', { name: /Editor Markdown em texto puro|Plain text Markdown editor/ })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 4500 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

async function deleteActiveNote(page) {
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mover' }).click()
}

async function runCommand(page, query) {
  await page.keyboard.press('Control+Shift+p')
  const commands = page.getByRole('dialog', { name: /Paleta de comandos|Command palette/ })
  await commands.getByRole('combobox').fill(query)
  await expect(commands.getByRole('option')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(commands).toBeHidden()
}

test('the help page opens on a fresh install and explains what it is', async ({ page }) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const read = page.locator('.visual-editor.read-only .cm-content')
  await expect(read.locator('.cm-md-h1')).toHaveText('Welcome')
  await expect(read.locator('.cm-md-quote').first()).toContainText('página de ajuda e exemplos')
  await expect(read).toContainText('Pode excluir esta nota sem medo')
  await expect(read).toContainText('Recriar página de ajuda')
})

test('the help page renders its sloth image and every example in reading mode', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const read = page.locator('.visual-editor.read-only .cm-content')
  const image = read.locator('.cm-image-preview').first()
  await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true)
  for (const level of [1, 2, 3, 4, 5, 6])
    await expect(read.locator(`.cm-md-h${level}`).first()).toBeVisible()
  await expect(read.locator('.cm-md-inline-strike')).toHaveText('riscado')
  await expect(read.locator('.cm-md-inline-tag')).toHaveText(['#ideias', '#projeto/lista'])
  await expect(read.locator('.cm-md-quote-nested')).toContainText('aninhadas')
  await expect(read.locator('.cm-md-rule')).toHaveCount(1)
  await expect(read.locator('.cm-task-checkbox')).toHaveCount(3)
  await expect(read.locator('.cm-md-wiki')).toHaveText(['Welcome', 'com outro texto'])
  // Leitura never reveals the Markdown of the line under the cursor.
  await expect(read.locator('.cm-md-editing')).toHaveCount(0)
})

test('the help page renders in the live editor away from the cursor', async ({ page }) => {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const live = page.locator('.cm-content')
  const image = live.locator('.cm-image-preview')
  await expect.poll(() => image.evaluate((el) => el.complete && el.naturalWidth > 0)).toBe(true)
  for (const level of [1, 2, 3, 4, 5, 6])
    await expect(live.locator(`.cm-md-h${level}`).first()).toBeVisible()
  await expect(live.locator('.cm-md-inline-strong').first()).toBeVisible()
  await expect(live.locator('.cm-md-inline-strike')).toHaveText('riscado')
  await expect(live.locator('.cm-md-inline-tag')).toHaveText(['#ideias', '#projeto/lista'])
  await expect(live.locator('.cm-md-quote-nested')).toContainText('aninhadas')
  await expect(live.locator('.cm-md-table-cell[data-align="right"]').first()).toHaveCSS(
    'text-align',
    'right',
  )
  await expect(live.locator('.cm-md-rule')).toHaveCount(1)
  await expect(live.locator('.cm-line', { hasText: 'sem itálico' })).toContainText('*sem itálico*')
  await expect(live.locator('.cm-line', { hasText: 'sem itálico' })).not.toContainText('\\')
})

test('deleting the help page loses nothing: the command recreates it', async ({ page }) => {
  await deleteActiveNote(page)
  await expect(page.getByRole('button', { name: 'Welcome.md', exact: true })).toBeHidden()
  await runCommand(page, 'ajuda')
  await expect(page.locator('.tab.active')).toHaveText('Welcome.md')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(sourceBox(page)).toHaveValue(welcomeBody('pt-BR'))
})

test('recreating while the help page exists keeps it and adds a numbered copy', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await sourceBox(page).fill('# Welcome\n\nMinhas anotações')
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await page.getByRole('menuitem', { name: 'Recriar página de ajuda' }).click()
  await expect(page.locator('.tab.active')).toHaveText('Welcome (2).md')
  await expect(sourceBox(page)).toHaveValue(welcomeBody('pt-BR'))
  await page.getByRole('button', { name: 'Welcome.md', exact: true }).click()
  await expect(sourceBox(page)).toHaveValue('# Welcome\n\nMinhas anotações')
})

test('the recreated help page follows the interface language', async ({ page }) => {
  await page.keyboard.press('Control+,')
  await page
    .getByRole('dialog', { name: 'Configurações' })
    .getByRole('radio', { name: 'English' })
    .check({ force: true })
  await page.keyboard.press('Escape')
  await runCommand(page, 'help')
  await expect(page.locator('.tab.active')).toHaveText('Welcome (2).md')
  await page.getByRole('radio', { name: 'Code', exact: true }).check({ force: true })
  await expect(sourceBox(page)).toHaveValue(welcomeBody('en'))
})

test('a saved note list that no longer has the help page is not given one again', async ({
  page,
}) => {
  const document = newDocument()
  document.notes = [{ id: 'mine', name: 'Mine.md', body: '# Mine\n\nTexto', revision: 0 }]
  document.openIds = ['mine']
  document.activeId = 'mine'
  await page.evaluate(({ key, document }) => localStorage.setItem(key, JSON.stringify(document)), {
    key: STORAGE_KEY,
    document,
  })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Mine.md', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Welcome.md', exact: true })).toHaveCount(0)
})
