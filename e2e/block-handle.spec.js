import { expect, test } from '@playwright/test'

const box = (page) => page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })
const fill = async (page, text) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
const source = async (page, text) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(text)
}
const openMenu = async (page, text) => {
  await page.locator('.cm-line', { hasText: text }).hover()
  await page.locator('.cm-block-handle').click()
  const menu = page.getByRole('menu', { name: 'Ações do bloco' })
  await expect(menu).toBeVisible()
  return menu
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto('/')
})

test('the block menu turns a paragraph into a heading', async ({ page }) => {
  await fill(page, '# Nota\n\nUm parágrafo\n\nOutro')
  const menu = await openMenu(page, 'Um parágrafo')
  await menu.getByRole('menuitemradio', { name: 'Título 2' }).click()
  await source(page, '# Nota\n\n## Um parágrafo\n\nOutro')
})

test('the block menu deletes a block and copies another', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await fill(page, '# Nota\n\nUm\n\nDois\n\nTrês')
  await (await openMenu(page, 'Dois')).getByRole('menuitem', { name: 'Excluir' }).click()
  await (await openMenu(page, 'Três')).getByRole('menuitem', { name: 'Copiar' }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Três')
  await source(page, '# Nota\n\nUm\n\nTrês')
})

test('adding below opens the block menu on a new line', async ({ page }) => {
  await fill(page, '# Nota\n\nUm\n\nDois')
  await (await openMenu(page, 'Um')).getByRole('menuitem', { name: 'Adicionar abaixo' }).click()
  await expect(page.locator('.block-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.type('Novo')
  await source(page, '# Nota\n\nUm\n\nNovo\n\nDois')
})

test('a list item can be indented from its menu', async ({ page }) => {
  await fill(page, '# Nota\n\n- um\n- dois')
  await (await openMenu(page, 'dois')).getByRole('menuitem', { name: 'Aumentar recuo' }).click()
  await source(page, '# Nota\n\n- um\n    - dois')
})

test('the selection toolbar turns blocks and strikes text', async ({ page }) => {
  await fill(page, '# Nota\n\nTexto riscado aqui')
  const line = page.locator('.cm-line', { hasText: 'Texto riscado' })
  await line.click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  const toolbar = page.getByRole('toolbar', { name: 'Formatação do texto selecionado' })
  await toolbar.getByRole('button', { name: 'Tachado', exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Home')
  await toolbar.getByRole('button', { name: /Transformar bloco/ }).click()
  await toolbar.getByRole('menuitemradio', { name: 'Citação' }).click()
  await source(page, '# Nota\n\n> ~~Texto riscado aqui~~')
})
