import { test, expect } from '@playwright/test'

const body = `# Comparação

## Localização

| Modelo | Alvos existentes | Cliques falsos | p50 | VRAM total |
| --- | ---: | ---: | ---: | ---: |
| *LFM3-VL-2B* (p2d, raciocínio limitado a 512 tokens) | *105/105* | *0* | 0,9 s | 3,4 GB |
| MAI-UI-2B (localizador do P1) | 84/105 | 0 | 0,17 s | 4,5 GB |

## Planner

| Modelo | Sem raciocínio | Com raciocínio (1 repetição, só indicação) |
| --- | ---: | ---: |
| Qwen3-4B-2507 (referência) | *50/55* | — |
| LFM3-1.7B | 11/55 | 7/11, cerca de 40 s por episódio |
`
for (const width of [390, 1280]) {
  test(`formatted table cells stay intact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill(body)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const rows = page.locator('.cm-md-table-row:not(.cm-md-table-divider)')
    await expect(rows).toHaveCount(6)
    await expect(page.locator('.visual-editor .cm-selectionLayer')).toHaveCSS('z-index', '2')
    await expect(page.locator('.visual-editor .cm-selectionLayer')).toHaveCSS(
      'pointer-events',
      'none',
    )
    const first = rows.nth(1).locator(':scope > .cm-md-table-cell')
    await expect(first).toHaveCount(5)
    await expect(first.nth(0)).toContainText('LFM3-VL-2B')
    await expect(first.nth(1)).toHaveText('105/105')
    const boxes = await first.evaluateAll((cells) =>
      cells.map((cell) => {
        const r = cell.getBoundingClientRect()
        return { y: r.y, bottom: r.bottom }
      }),
    )
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1)
    expect(new Set(boxes.map((b) => Math.round(b.bottom))).size).toBe(1)
    await expect(page.locator('.tab.active')).toHaveText('Comparação')
    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/table-${width}.png`, fullPage: true })
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(
      page
        .locator('.visual-editor.read-only .cm-md-table-row:not(.cm-md-table-divider)')
        .nth(1)
        .locator(':scope > .cm-md-table-cell'),
    ).toHaveCount(5)
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(body)
  })
}

for (const width of [390, 1280]) {
  test(`table links reveal their source for editing at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page
      .locator('textarea')
      .fill(
        '# Links\n\n| Site | Nota |\n| --- | --- |\n| [Exemplo](https://example.com) | [[Interno]] |\n\nFim',
      )
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const cells = page
      .locator('.cm-md-table-row:not(.cm-md-table-divider)')
      .nth(1)
      .locator('.cm-md-table-cell')
    await cells.nth(0).locator('.cm-md-inline-link').click()
    await expect(cells.nth(0)).toContainText('[Exemplo](https://example.com)')
    await expect(cells.nth(1)).toHaveText('Interno')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.type('x')
    await expect(cells.nth(0)).toContainText('x')
    await cells.nth(1).locator('.cm-md-inline-link').click()
    await expect(cells.nth(1)).toContainText('[[Interno]]')
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(page.locator('.visual-editor.read-only .cm-md-table-cell').last()).toHaveText(
      'Interno',
    )
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(/\[Exemplo\]\(https:\/\/example\.comx\)/)
  })
}

const source = async (page) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const value = await page.locator('textarea').inputValue()
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  return value
}

for (const width of [390, 1280]) {
  test(`table bars select, format, remove and insert at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page
      .locator('textarea')
      .fill('# Teste\n\nTexto antes\n\n| Nome | Valor |\n| --- | --- |\n| Ana | 2 |\n|  | 3 |')
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    await page.locator('.cm-md-table-head .cm-md-table-cell').first().click()
    const toolbar = page.getByRole('toolbar')
    await page.getByRole('button', { name: 'Selecionar coluna 1', exact: true }).click()
    await expect(toolbar).toHaveAttribute('aria-label', 'Ações da coluna')
    await expect(page.locator('.cm-table-axis-selected')).toHaveCount(3)
    await expect
      .poll(async () => {
        const box = await toolbar.boundingBox()
        return box.x >= 0 && box.x + box.width <= width
      })
      .toBe(true)
    if (process.env.CAPTURE_UI) await page.screenshot({ path: `/tmp/table-toolbar-${width}.png` })
    await toolbar.getByRole('button', { name: 'Negrito' }).click()
    await expect(toolbar.getByRole('button', { name: 'Negrito' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await toolbar.getByRole('button', { name: 'Centralizar' }).click()
    expect(await source(page)).toContain(
      '| **Nome** | Valor |\n| :---: | --- |\n| **Ana** | 2 |\n|  | 3 |',
    )

    await page.getByRole('button', { name: 'Selecionar coluna 2', exact: true }).click()
    await expect(toolbar).toBeVisible()
    await page.locator('.cm-md-table-cell', { hasText: '3' }).click()
    await expect(toolbar).toHaveCount(0)

    await page.getByRole('button', { name: 'Selecionar linha 2', exact: true }).click()
    await expect(toolbar).toHaveAttribute('aria-label', 'Ações da linha')
    await page.keyboard.press('Escape')
    await expect(toolbar).toHaveCount(0)

    await page.getByRole('button', { name: 'Selecionar linha 3', exact: true }).click()
    const remove = toolbar.getByRole('button', { name: 'Remover linha' })
    await remove.hover()
    await expect(page.locator('.cm-content.cm-table-danger')).toHaveCount(1)
    if (process.env.CAPTURE_UI) await page.screenshot({ path: `/tmp/table-danger-${width}.png` })
    await remove.click()
    await expect(toolbar).toHaveCount(0)
    expect(await source(page)).not.toContain('|  | 3 |')

    await page.locator('.cm-md-table-head .cm-md-table-cell').first().click()
    const pin = page.getByRole('button', { name: 'Adicionar coluna à direita', exact: true })
    await pin.hover({ force: true })
    await expect(page.locator('.cm-table-guide-column.is-after')).toBeVisible()
    if (process.env.CAPTURE_UI) await page.screenshot({ path: `/tmp/table-pin-${width}.png` })
    await pin.click({ force: true })
    expect(await source(page)).toContain('| **Nome** | Valor |  |')
  })
}

test('table handle menu toggles headers, adds a paragraph and deletes the table', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Teste\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nFim')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-md-table-cell', { hasText: '2' }).click()
  const handle = page.getByRole('button', { name: 'Ações da tabela', exact: true })
  await handle.click()
  const menu = page.getByRole('menu', { name: 'Ações da tabela' })
  await expect(menu.getByRole('menuitemcheckbox', { name: 'Linha de cabeçalho' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.locator('.cm-md-table-headrow')).toHaveCount(1)
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/table-handle-menu.png' })
  await menu.getByRole('menuitemcheckbox', { name: 'Linha de cabeçalho' }).click()
  await expect(menu).toHaveCount(0)
  await handle.click()
  await expect(page.locator('.cm-md-table-headrow')).toHaveCount(0)
  await handle.click()
  await menu.getByRole('menuitemcheckbox', { name: 'Coluna de cabeçalho' }).click()
  await expect(page.locator('.cm-md-table-headcell')).toHaveCount(2)
  expect(await source(page)).toContain(
    '<!-- sloth:table no-header-row header-column -->\n| A | B |\n| --- | --- |\n| 1 | 2 |',
  )
  await page.locator('.cm-md-table-cell', { hasText: '2' }).click()
  await handle.click()
  await menu.getByRole('menuitemcheckbox', { name: 'Linha de cabeçalho' }).click()
  expect(await source(page)).toContain('<!-- sloth:table header-column -->\n| A | B |')
  await page.locator('.cm-md-table-cell', { hasText: '2' }).click()
  await handle.click()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await handle.click()
  await menu.getByRole('menuitem', { name: 'Adicionar abaixo' }).click()
  await expect(page.locator('.block-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.type('Novo')
  expect(await source(page)).toContain('| 1 | 2 |\n\nNovo\n\nFim')
  await page.locator('.cm-md-table-cell', { hasText: '2' }).click()
  await handle.click()
  await menu.getByRole('menuitem', { name: 'Excluir tabela' }).click()
  expect(await source(page)).toBe('# Teste\n\nNovo\n\nFim')
})

test('the header row stays in view while a long table scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 600 })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const rows = Array.from({ length: 40 }, (_, i) => `| Item ${i + 1} | ${i} |`).join('\n')
  await page.locator('textarea').fill(`# Teste\n\n| Nome | Valor |\n| --- | --- |\n${rows}\n\nFim`)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect(page.locator('.cm-md-table-row')).not.toHaveCount(0)
  // The page grows as the editor lays out, so the scroll is repeated until it lands.
  await expect.poll(() => page.evaluate(() => (window.scrollTo(0, 500), window.scrollY))).toBe(500)
  const head = page.locator('.cm-md-table-headrow')
  const top = await page
    .locator('.app-header')
    .evaluate((node) => node.getBoundingClientRect().bottom)
  await expect.poll(async () => Math.abs((await head.boundingBox()).y - top)).toBeLessThan(2)
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/table-sticky.png' })
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await expect(page.locator('style', { hasText: 'translateY' })).toHaveCount(0)
})
