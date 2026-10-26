import { test, expect } from '@playwright/test'
import { BLOCK_SHORTCUTS } from '../src/editor-shortcuts.js'
import { blockTemplate } from '../src/insert-block.js'

const base = '# Atalhos\n\n'
const body = (page) => page.evaluate(() => JSON.parse(localStorage['sloth-note:v3']).notes[0].body)
async function sample(page, mode = 'Padrão') {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(base)
  if (mode === 'Padrão')
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
  await page.locator(mode === 'Padrão' ? '.cm-content' : 'textarea').focus()
  await page.keyboard.press('Control+End')
}

for (const mode of ['Padrão', 'Código']) {
  test(`missing block shortcuts insert editable content and support undo in ${mode}`, async ({
    page,
  }) => {
    for (const [keys, , action] of BLOCK_SHORTCUTS.filter(([, , action]) => action !== 'image')) {
      await sample(page, mode)
      await page.keyboard.press(`Control+${keys.replace('`', 'Backquote')}`)
      await expect.poll(() => body(page)).toBe(base + blockTemplate(action).text)
      await page.keyboard.press('Control+z')
      await expect.poll(() => body(page)).toBe(base)
    }
  })
}

for (const width of [390, 1280]) {
  test(`every insert action displays a shortcut and works while the menu has focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await sample(page)
    await page.getByRole('button', { name: 'Inserir bloco', exact: true }).click()
    const menu = page.locator('.block-menu')
    for (const item of await menu.getByRole('menuitem').all()) {
      await expect(item.locator('kbd')).toHaveCount(3)
    }
    const table = menu.getByRole('menuitem', { name: 'Tabela', exact: true })
    await table.hover()
    await expect(page.getByRole('tooltip').locator('kbd')).toHaveText(['Ctrl', '⇧', '5'])
    if (process.env.CAPTURE_UI) {
      await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1')
      await page.screenshot({ path: `/tmp/sloth-block-shortcuts-${width}.png` })
      if (width === 1280)
        await menu.screenshot({ path: 'public/changelog/insert-block-shortcuts.png' })
    }
    await page.keyboard.press('Control+Shift+5')
    await expect(menu).toBeHidden()
    await expect.poll(() => body(page)).toBe(base + blockTemplate('table').text)
    await page.keyboard.type('Nome')
    await expect.poll(() => body(page)).toContain('| Nome | Coluna 2 |')
  })
}

test('image shortcut opens insertion, keeps the destination and returns focus after cancellation', async ({
  page,
}) => {
  await sample(page)
  await page.keyboard.press('Control+Shift+6')
  const dialog = page.locator('.image-insert')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input[type="url"]')).toBeFocused()
  await page.keyboard.press('Control+Shift+5')
  await expect.poll(() => body(page)).toBe(base)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.cm-content')).toBeFocused()
  await expect.poll(() => body(page)).toBe(base)
  await page.keyboard.press('Control+Shift+6')
  await dialog.locator('input[type="url"]').fill('https://example.test/image.png')
  await dialog.locator('button[type="submit"]').click()
  await expect.poll(() => body(page)).toContain('![Imagem](https://example.test/image.png)')
})

test('image shortcut in source opens the file chooser without changing the note', async ({
  page,
}) => {
  await sample(page, 'Código')
  const chooser = page.waitForEvent('filechooser')
  await page.keyboard.press('Control+Shift+6')
  await (await chooser).setFiles([])
  await expect.poll(() => body(page)).toBe(base)
})

test('Mac shortcuts use Command and Option and cannot insert blocks in the library search', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel' }),
  )
  await sample(page)
  await page.keyboard.press('Meta+Alt+Shift+3')
  await expect.poll(() => body(page)).toBe(base + '### ')
  await page.getByRole('textbox', { name: 'Buscar em todas as notas…', exact: true }).focus()
  await page.keyboard.press('Meta+Alt+Shift+5')
  await expect.poll(() => body(page)).toBe(base + '### ')
  await page.keyboard.press('Meta+Shift+/')
  const heading = page
    .locator('.shortcut-list')
    .getByRole('listitem')
    .filter({ hasText: 'Título 3' })
  await expect(heading.locator('kbd')).toHaveText(['⌘', 'Alt', '⇧', '3'])
})

test('the shortcuts list includes all newly available block actions', async ({ page }) => {
  await sample(page)
  await page.keyboard.press('Control+Shift+/')
  const list = page.locator('.shortcut-list')
  for (const [key, label] of [
    ['2', 'Título 2'],
    ['3', 'Título 3'],
    ['4', 'Título 4'],
    ['5', 'Tabela'],
    ['6', 'Imagem'],
    ['7', 'Lista numerada'],
    ['`', 'Bloco de código'],
  ]) {
    const row = list.getByRole('listitem').filter({ hasText: label })
    await expect(row.locator('kbd')).toHaveText(['Ctrl', '⇧', key])
  }
})
