import { test, expect } from '@playwright/test'
const source =
  '# Tabelas\n\n| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n| Valor 1 | Abc | x |\n|  |  |  |\n|  |  |  |'
const rows = (page) => page.locator('.cm-md-table-row:not(.cm-md-table-divider)')
const markdown = async (page) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const value = await page.locator('textarea').inputValue()
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  return value
}
async function setup(page) {
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}

test('empty rows keep a full height and accept typing', async ({ page }) => {
  await setup(page)
  const heights = await rows(page).evaluateAll((items) =>
    items.map((item) => item.getBoundingClientRect().height),
  )
  for (const height of heights) expect(height).toBeGreaterThan(30)
  await rows(page).nth(2).locator('.cm-md-table-cell').nth(1).click()
  await page.keyboard.type('Novo')
  expect(await markdown(page)).toMatch(/\| Valor 1 \| Abc \| x \|\n\| {2}\| *Novo *\| {2}\|/)
})

test('a click below a table at the end of the note starts a paragraph', async ({ page }) => {
  await setup(page)
  const box = await rows(page).last().boundingBox()
  await page.mouse.click(box.x + 40, box.y + box.height + 30)
  await page.keyboard.type('Depois')
  expect(await markdown(page)).toMatch(/\|( {2}\|){3}\n\nDepois$/)
})

// Opens Cores in the table menu and picks a swatch of a group.
async function pickColor(page, group, color) {
  await page
    .getByRole('menu', { name: 'Ações da tabela' })
    .getByRole('menuitem', { name: 'Cores', exact: true })
    .click()
  await page
    .locator(`.editor-popup-submenu [aria-label="${group}"] [aria-label="${color}"]`)
    .click()
}

test('several columns take text and background colors together', async ({ page }) => {
  await setup(page)
  await rows(page).first().hover()
  const segments = page.locator('.cm-table-column-segment')
  await segments.nth(1).click()
  await segments.nth(2).click({ modifiers: ['Shift'] })
  await expect(page.locator('.cm-table-column-segment.is-selected')).toHaveCount(2)
  await pickColor(page, 'Cor do texto', 'Azul')
  await segments.nth(2).click({ modifiers: ['Shift'] })
  await pickColor(page, 'Cor de fundo', 'Amarelo')
  await expect(rows(page).nth(1).locator('.cm-table-fg-blue')).toHaveCount(2)
  await expect(rows(page).nth(1).locator('.cm-table-bg-yellow')).toHaveCount(2)
  const text = await markdown(page)
  expect(text).toContain('colors=0:1:yellow')
  expect(text).toContain('text=0:1:blue')
  expect(text).not.toMatch(/:0:(blue|yellow)/)
})

test('shift extends a row selection and bold applies to every row', async ({ page }) => {
  await setup(page)
  await rows(page).nth(1).hover()
  await page.locator('.cm-table-row-segment').nth(1).click()
  await page
    .locator('.cm-table-row-segment')
    .nth(2)
    .click({ modifiers: ['Shift'] })
  await expect(page.locator('.cm-table-row-segment.is-selected')).toHaveCount(2)
  await page.getByRole('menuitem', { name: 'Formatar' }).click()
  await page
    .getByRole('menu', { name: 'Formatar' })
    .getByRole('menuitem', { name: 'Negrito' })
    .click()
  expect(await markdown(page)).toContain('| **Valor 1** | **Abc** | **x** |')
})

test('a click selects a cell without a text cursor and typing replaces it', async ({ page }) => {
  await setup(page)
  const cell = rows(page).nth(1).locator('.cm-md-table-cell').nth(1)
  await cell.click()
  await expect(cell).toHaveClass(/cm-sheet-cursor/)
  await expect(page.locator('.cm-sheet-editing')).toHaveCount(0)
  await page.keyboard.type('Novo')
  await expect(page.locator('.cm-sheet-editing')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(rows(page).nth(2).locator('.cm-md-table-cell').nth(1)).toHaveClass(/cm-sheet-cursor/)
  expect(await markdown(page)).toContain('| Valor 1 | Novo | x |')
})

test('Shift+Enter in a task cell starts another task', async ({ page }) => {
  await setup(page)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# T\n\n| A | B |\n| --- | --- |\n| - [ ] Abc | x |')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const cell = rows(page).nth(1).locator('.cm-md-table-cell').first()
  await cell.dblclick()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('Def')
  // The line above shows its checkbox; the cursor line shows the Markdown to edit.
  const editor = page.locator('.cm-sheet-editing')
  await expect(editor.locator('.cm-line').first().locator('input[type=checkbox]')).toHaveCount(1)
  await expect(editor.locator('.cm-line').last()).toHaveText('- [ ] Def')
  await page.keyboard.press('Enter')
  expect(await markdown(page)).toContain('| - [ ] Abc<br>- [ ] Def | x |')
})

test('right click on a cell opens the table menu with cell actions', async ({ page }) => {
  await setup(page)
  await rows(page).nth(1).locator('.cm-md-table-cell').nth(1).click({ button: 'right' })
  const menu = page.getByRole('menu', { name: 'Ações da tabela' })
  await expect(menu.getByRole('menuitem', { name: 'Cores', exact: true })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Alinhamento' })).toBeVisible()
  await menu.getByRole('menuitem', { name: 'Inserir linha abaixo' }).click()
  expect((await markdown(page)).match(/^\|[ |]+\|$/gm)).toHaveLength(3)
})

test('keyboard moves the selection, edits with F2 and Escape restores the cell', async ({
  page,
}) => {
  await setup(page)
  await rows(page).nth(0).locator('.cm-md-table-cell').first().click()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  const abc = rows(page).nth(1).locator('.cm-md-table-cell').nth(1)
  await expect(abc).toHaveClass(/cm-sheet-cursor/)
  await page.keyboard.press('F2')
  // The editor draws its own text cursor inside the cell.
  await expect(page.locator('.cm-sheet-editing .cm-cursor')).toHaveCount(1)
  await page.keyboard.type('def')
  expect(await page.locator('.cm-sheet-editing').innerText()).toContain('Abcdef')
  await page.keyboard.press('Escape')
  await expect(page.locator('.cm-sheet-editing')).toHaveCount(0)
  await expect(abc).toHaveText('Abc')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(rows(page).nth(2).locator('.cm-md-table-cell').first()).toHaveClass(
    /cm-sheet-cursor/,
  )
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(page.locator('.cm-sheet-cursor')).toHaveCount(0)
})

test('a dragged range takes bold, clears with Delete and copies as TSV', async ({ page }) => {
  await setup(page)
  const first = await rows(page).nth(0).locator('.cm-md-table-cell').first().boundingBox()
  const last = await rows(page).nth(1).locator('.cm-md-table-cell').nth(1).boundingBox()
  await page.mouse.move(first.x + 10, first.y + 10)
  await page.mouse.down()
  await page.mouse.move(last.x + 10, last.y + 10, { steps: 4 })
  await page.mouse.up()
  await expect(page.locator('.cm-sheet-selected')).toHaveCount(4)
  const copied = await page.evaluate(() => {
    const data = new DataTransfer()
    document
      .querySelector('.cm-sheet-input')
      .dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true }))
    return data.getData('text/plain')
  })
  expect(copied).toBe('Coluna 1\tColuna 2\nValor 1\tAbc')
  await page.keyboard.press('Control+b')
  expect(await markdown(page)).toContain('| **Valor 1** | **Abc** | x |')
  await rows(page).nth(1).locator('.cm-md-table-cell').first().click()
  await page.keyboard.press('Delete')
  await expect(rows(page).nth(1).locator('.cm-md-table-cell').first()).toHaveText('')
  await page.keyboard.press('Control+z')
  await expect(rows(page).nth(1).locator('.cm-md-table-cell').first()).toHaveText('Valor 1')
  expect(await markdown(page)).toContain('| **Valor 1** | **Abc** | x |')
})

test('pasting spreadsheet text fills cells and grows the table', async ({ page }) => {
  await setup(page)
  await rows(page).nth(3).locator('.cm-md-table-cell').nth(2).click()
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.evaluate(() => navigator.clipboard.writeText('1\t2\n3\t4'))
  await page.keyboard.press('Control+v')
  const text = await markdown(page)
  expect(text).toContain('|  |  | 1 | 2 |')
  expect(text).toMatch(/\| +\| +\| 3 \| 4 \|$/)
})

test('formulas show results, keep their source and explain errors', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Conta\n\n| Item | Qtd | Preço | Total |\n| --- | --- | --- | --- |\n| Caneta | 2 | 1,50 | =B2*C2 |\n| Caderno | 3 | 10 | =B3*C3 |\n| Total |  |  | =SOMA(D2:D3) |\n| Erro |  |  | =1/0 |',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const total = (row) => rows(page).nth(row).locator('.cm-md-table-cell').nth(3)
  await expect(total(1)).toHaveText('3')
  await expect(total(2)).toHaveText('30')
  await expect(total(3)).toHaveText('33')
  await expect(total(4)).toHaveText('#DIV/0!')
  await expect(total(4)).toHaveAttribute('title', /divisão por zero/)
  await rows(page).nth(1).locator('.cm-md-table-cell').nth(1).click()
  await page.keyboard.type('4')
  await page.keyboard.press('Enter')
  await expect(total(1)).toHaveText('6')
  await expect(total(3)).toHaveText('36')
  await total(3).dblclick()
  await expect(page.locator('.cm-sheet-editing')).toContainText('=SOMA(D2:D3)')
  await page.keyboard.press('Escape')
  await expect(total(3)).toHaveText('36')
})

test('the cell colors of the menu apply to every selected cell', async ({ page }) => {
  await setup(page)
  await rows(page).nth(1).locator('.cm-md-table-cell').first().click()
  await rows(page)
    .nth(1)
    .locator('.cm-md-table-cell')
    .nth(1)
    .click({ modifiers: ['Shift'] })
  await rows(page).nth(1).locator('.cm-md-table-cell').nth(1).click({ button: 'right' })
  await pickColor(page, 'Cor do texto', 'Azul')
  await expect(rows(page).nth(1).locator('.cm-table-fg-blue')).toHaveCount(2)
})

test('the menu aligns selected cells horizontally and vertically', async ({ page }) => {
  await setup(page)
  const cell = rows(page).nth(1).locator('.cm-md-table-cell').nth(1)
  await cell.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Alinhamento' }).click()
  const panel = page.getByRole('menu', { name: 'Alinhamento' })
  await panel.getByRole('menuitemradio', { name: 'Alinhar à direita' }).click()
  await expect(cell).toHaveAttribute('data-align', 'right')
  await cell.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Alinhamento' }).click()
  await panel.getByRole('menuitemradio', { name: 'Meio' }).click()
  await expect(cell).toHaveAttribute('data-valign', 'middle')
  expect(await markdown(page)).toContain('halign=1:1:right valign=1:1:middle')
})
