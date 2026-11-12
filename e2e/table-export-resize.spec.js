import { test, expect } from '@playwright/test'
const source =
  '# Planilha\n\n| Nome | Código |\n| --- | --- |\n| José | 001 |\n| Texto extenso para conferir a quebra da célula | 002 |\n\nFim'
const rows = (page) => page.locator('.cm-md-table-row:not(.cm-md-table-divider)')
async function setup(page) {
  await page.setViewportSize({ width: 1280, height: 844 })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(source)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
test('table exports CSV and XLSX downloads', async ({ page }) => {
  await setup(page)
  for (const format of ['CSV', 'XLSX']) {
    await rows(page).first().hover()
    await page.getByRole('button', { name: 'Ações da tabela', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Exportar', exact: true }).click()
    const pending = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: `Exportar ${format}`, exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe(`tabela.${format.toLowerCase()}`)
    expect(await download.failure()).toBeNull()
  }
})
test('column resize redistributes full width live, cancels and undoes', async ({ page }) => {
  await setup(page)
  const row = rows(page).nth(1)
  const cells = row.locator(':scope > .cm-md-table-cell')
  const first = cells.first()
  const initial = await first.boundingBox()
  const drag = async () => {
    const box = await first.boundingBox()
    await page.mouse.move(box.x + box.width - 1, box.y + 15)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 70, box.y + 15, { steps: 5 })
  }
  await drag()
  await expect.poll(async () => (await first.boundingBox()).width).toBeLessThan(initial.width - 60)
  const checkWidth = async () => {
    const firstBox = await first.boundingBox()
    const lastBox = await cells.last().boundingBox()
    const rowBox = await row.boundingBox()
    expect(Math.abs(lastBox.x + lastBox.width - rowBox.x - rowBox.width)).toBeLessThan(2)
    expect(Math.abs(firstBox.x - rowBox.x)).toBeLessThan(2)
  }
  await checkWidth()
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect
    .poll(async () => Math.abs((await first.boundingBox()).width - initial.width))
    .toBeLessThan(2)
  await drag()
  await page.mouse.up()
  await checkWidth()
  await first.click()
  await page.keyboard.press('Control+z')
  await expect
    .poll(async () => Math.abs((await first.boundingBox()).width - initial.width))
    .toBeLessThan(2)
  // Old pixel sizes must also fill the document, with automatic row heights.
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      source.replace('| Nome', '<!-- sloth:table widths=100,300 heights=100,200,100 -->\n| Nome'),
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await checkWidth()
  const box = await first.boundingBox()
  await page.mouse.move(box.x + 30, box.y + box.height - 1)
  await expect(page.locator('.cm-content')).not.toHaveCSS('cursor', 'row-resize')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
  await checkWidth()
  await expect(page.locator('.visual-editor')).toBeVisible()
})

test('column boundary highlights the full table while row borders remain static', async ({
  page,
}) => {
  await setup(page)
  const first = rows(page).nth(1).locator(':scope > .cm-md-table-cell').first()
  const box = await first.boundingBox()
  await page.mouse.move(box.x + box.width - 1, box.y + 15)
  const aligned = async () => {
    const control = page.locator('.cm-table-column-tool').first()
    const controlBox = await control.boundingBox()
    for (const row of await rows(page).all()) {
      const rowBox = await row.boundingBox()
      const cellBox = await row.locator(':scope > .cm-md-table-cell').first().boundingBox()
      const line = await row.evaluate((element) => {
        const style = getComputedStyle(element, '::after')
        return {
          left: parseFloat(style.left),
          width: parseFloat(style.width),
          content: style.content,
        }
      })
      expect(line.content).toBe('""')
      expect(line.width).toBe(2)
      expect(Math.abs(rowBox.x + line.left - cellBox.x - cellBox.width)).toBeLessThan(1)
      expect(Math.abs(rowBox.x + line.left - controlBox.x - controlBox.width)).toBeLessThan(1)
    }
  }
  await aligned()
  await page.screenshot({ path: '/tmp/sloth-table-boundary-aligned.png' })
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 80, box.y + 15, { steps: 5 })
  await aligned()
  await page.screenshot({ path: '/tmp/sloth-table-boundary-dragging.png' })
  await page.mouse.up()
  await page.mouse.move(box.x + 30, box.y + box.height - 1)
  expect(
    await rows(page)
      .first()
      .evaluate((element) => getComputedStyle(element, '::after').content),
  ).toBe('none')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
  const mobileBox = await first.boundingBox()
  await page.mouse.move(mobileBox.x + mobileBox.width - 1, mobileBox.y + 15)
  await aligned()
  await page.screenshot({ path: '/tmp/sloth-table-boundary-mobile.png' })
})

test('table cells render lists, breaks and interactive tasks; backgrounds persist', async ({
  page,
}) => {
  await setup(page)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .locator('textarea')
    .fill(
      '# Projeto\n\n| Etapa | Entregas |\n| --- | --- |\n| Design | - [ ] Ícones<br>- [x] **Guia visual** |\n| Revisão | - Cliente<br>- Equipe |\n| Links | [Site](https://example.com) e `código` |',
    )
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect(page.getByRole('checkbox', { name: 'Ícones' })).not.toBeChecked()
  await page.getByRole('checkbox', { name: 'Ícones' }).check()
  await expect(page.getByRole('checkbox', { name: 'Ícones' })).toBeChecked()
  const cell = rows(page).nth(1).locator(':scope > .cm-md-table-cell').last()
  await cell.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Cores', exact: true }).click()
  await page
    .locator('.editor-popup-submenu [aria-label="Cor de fundo"] [aria-label="Verde"]')
    .click()
  await expect(cell).toHaveClass(/cm-table-bg-green/)
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.getByRole('checkbox', { name: 'Ícones' })).toBeDisabled()
  await expect(cell).toHaveClass(/cm-table-bg-green/)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(/colors=1:1:green/)
  await expect(page.locator('textarea')).toHaveValue(/- \[x\] Ícones/)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect(page.getByRole('checkbox', { name: 'Ícones' })).toBeChecked()
  for (const row of await rows(page).all()) {
    const items = row.locator(':scope > .cm-md-table-cell')
    await expect(items).toHaveCount(2)
    const boxes = await items.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().top),
    )
    expect(Math.abs(boxes[0] - boxes[1])).toBeLessThan(2)
  }
  // Double click edits the cell: one line per item, Markdown on the cursor line.
  await cell.dblclick()
  const editor = page.locator('.cm-sheet-editing')
  await expect(editor.locator('.cm-line')).toHaveCount(2)
  await page.keyboard.press('Control+End')
  await expect(editor.locator('.cm-line').last()).toHaveText('- [x] **Guia visual**')
  await page.keyboard.type(' concluído')
  await page.keyboard.press('Escape')
  await expect(editor).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: 'Ícones' })).toBeChecked()
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 })
    if (width === 390)
      await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
    await page.screenshot({ path: `/tmp/sloth-rich-cells-${width}.png` })
  }
})

test('task toggles keep literal break tags and checkbox markers inside code unchanged', async ({
  page,
}) => {
  await setup(page)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const original = '# Nota\n\n| A |\n| --- |\n| - [ ] `<br>- [ ] exemplo`<br>- [ ] Real |'
  await page.locator('textarea').fill(original)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.getByRole('checkbox', { name: 'Real', exact: true }).check()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(original.replace('- [ ] Real', '- [x] Real'))
})
