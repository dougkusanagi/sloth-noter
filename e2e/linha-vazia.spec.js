import { expect, test } from '@playwright/test'

// The text box, without the line padding that carries the gap between blocks.
const box = (page, text) =>
  page.evaluate((wanted) => {
    const line = [...document.querySelectorAll('.cm-content > .cm-line')].find(
      (element) => element.textContent === wanted,
    )
    const range = document.createRange()
    range.selectNodeContents(line)
    const { x, y, height } = range.getClientRects()[0]
    return { x, y, height }
  }, text)
const caretLine = (page) =>
  page.evaluate(() => {
    const node = getSelection().anchorNode
    return (node.nodeType === 1 ? node : node.parentElement).closest('.cm-line').textContent
  })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('\n\n\nab\n```\nabc\n```\na\n\nbbb\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
})

// Every block is separated by the same gap, with or without an empty source line.
test('blocos têm o mesmo espaço, com ou sem linha vazia no texto', async ({ page }) => {
  // Wait for the fonts, so the boxes are measured after the final layout.
  await page.evaluate(() => document.fonts.ready)
  await expect
    .poll(async () => {
      const ab = await box(page, 'ab')
      const fence = await page.locator('.cm-md-fence-start').boundingBox()
      return fence.y - (ab.y + ab.height)
    })
    .toBeGreaterThan(15)
  const ab = await box(page, 'ab')
  const fence = await page.locator('.cm-md-fence-start').boundingBox()
  const end = await page.locator('.cm-md-fence-end').boundingBox()
  const a = await box(page, 'a')
  const bbb = await box(page, 'bbb')
  const gapAbove = fence.y - (ab.y + ab.height)
  const gapBelow = a.y - (end.y + end.height)
  const gapBlank = bbb.y - (a.y + a.height)
  expect(gapAbove).toBeGreaterThan(15)
  expect(Math.abs(gapBelow - gapAbove)).toBeLessThan(5)
  expect(Math.abs(gapBlank - gapAbove)).toBeLessThan(5)
})

// Regression: ArrowUp from the last line jumped to the first text line.
test('setas pulam a linha separadora e vão para o bloco vizinho', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'bbb' }).click()
  await page.keyboard.press('ArrowUp')
  expect(await caretLine(page)).toBe('a')
  await page.keyboard.press('ArrowDown')
  expect(await caretLine(page)).toBe('bbb')
})

test('Enter no fim de um parágrafo cria outro parágrafo com o espaço padrão', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'bbb' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('ccc')
  const bbb = await box(page, 'bbb')
  const ccc = await box(page, 'ccc')
  const a = await box(page, 'a')
  expect(Math.abs(ccc.y - bbb.y - (bbb.y - a.y))).toBeLessThan(2)
})

test('a dica de inserir blocos fica na linha vazia do cursor', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'bbb' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const line = page.locator('.cm-md-blank.cm-md-editing')
  const tip = page.locator('.insert-trigger')
  await expect
    .poll(async () => Math.abs((await tip.boundingBox()).y - (await line.boundingBox()).y))
    .toBeLessThan(4)
})

// Regression: with the file's final line break, Enter showed an extra empty line below.
test('Enter no último parágrafo não mostra linha vazia a mais', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'bbb' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const rows = await page.locator('.cm-content > *').evaluateAll((elements) =>
    elements.slice(-4).map((element) => ({
      kind: element.classList.contains('cm-block-gap') ? 'gap' : element.textContent,
      height: Math.round(element.getBoundingClientRect().height),
    })),
  )
  // bbb, the standard gap (not a line), the new paragraph, the file's final line break.
  expect(rows.map((row) => row.kind)).toEqual(['bbb', 'gap', '', ''])
  expect(rows[2].height).toBeGreaterThan(25)
  expect(rows[3].height).toBe(0)
})

// Regression: the gap line could be clicked and then looked like an empty line.
test('não há linha vazia clicável entre dois parágrafos', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'bbb' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('ccc')
  const gaps = await page
    .locator('.cm-md-gap')
    .evaluateAll((lines) => lines.map((line) => line.getBoundingClientRect().height))
  expect(gaps.every((height) => height === 0)).toBe(true)
  const bbb = await box(page, 'bbb')
  const ccc = await box(page, 'ccc')
  await page.mouse.click(bbb.x + 5, (bbb.y + bbb.height + ccc.y) / 2)
  expect(['bbb', 'ccc']).toContain(await caretLine(page))
})

test('um clique no espaço entre blocos leva ao bloco de baixo', async ({ page }) => {
  await page.locator('.cm-block-gap').last().click()
  expect(await caretLine(page)).toBe('bbb')
})

// Regression: in WebKit the arrow keys moved the browser selection into the gap, and the caret
// and the insert tip showed at the edge of the editor.
test('uma seleção posta dentro do espaço vai para o bloco vizinho', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'bbb' }).click()
  const line = await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/.vite/deps/@codemirror_view.js')
    const view = EditorView.findFromDOM(document.querySelector('.cm-editor'))
    const doc = view.state.doc
    const bbb = doc.line(
      [...Array(doc.lines)].findIndex((_, i) => doc.line(i + 1).text === 'bbb') + 1,
    )
    // The empty line above bbb is the gap; a native selection lands on its start.
    view.dispatch({ selection: { anchor: bbb.from - 1 } })
    return doc.lineAt(view.state.selection.main.head).text
  })
  expect(['a', 'bbb']).toContain(line)
})

// Regression: Shift+Enter at the end of a two-line paragraph jumped into the paragraph below.
test('Shift+Enter acrescenta uma linha ao mesmo parágrafo', async ({ page }) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# T\n\naaa\nfg\n\nggggg\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: 'fg' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Shift+Enter')
  await page.keyboard.type('hh')
  await page.keyboard.press('ArrowDown')
  expect(await caretLine(page)).toBe('ggggg')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue('# T\n\naaa\nfg\nhh\n\nggggg\n')
})

// Regression: right below a heading, Enter at the start of the text only added the separator,
// drawn as the gap, so the new empty line could not take the cursor.
test('Enter no início do texto logo abaixo de um título cria uma linha vazia com cursor', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Nota\n\n## Seção\nteste\n\nfim\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: 'teste' }).click()
  await page.keyboard.press('Home')
  await page.keyboard.press('Enter')
  expect(await caretLine(page)).toBe('teste')
  await page.keyboard.press('ArrowUp')
  expect(await caretLine(page)).toBe('')
  await page.keyboard.type('nova')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue('# Nota\n\n## Seção\n\nnova\n\nteste\n\nfim\n')
})

// Regression: ArrowDown leaves the cursor at the start of the closing fence, and Enter there added
// a single line inside the code instead of a paragraph below it.
test('Enter depois de descer até o fim do código cria parágrafo com o espaço padrão', async ({
  page,
}) => {
  await page.locator('.cm-line', { hasText: 'abc' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.type('novo')
  await expect(page.locator('.cm-md-code')).toHaveCount(1)
  const end = await page.locator('.cm-md-fence-end').boundingBox()
  const ab = await box(page, 'ab')
  const fence = await page.locator('.cm-md-fence-start').boundingBox()
  const novo = await box(page, 'novo')
  const gapAbove = fence.y - (ab.y + ab.height)
  expect(Math.abs(novo.y - (end.y + end.height) - gapAbove)).toBeLessThan(5)
})

for (const width of [390, 768, 1280]) {
  test(`parágrafo vazio entre dois blocos de código já tem espaço a ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    const fence = '```'
    const source = ['# Nota', '', fence, 'primeiro()', fence, fence, 'segundo()', fence].join('\n')
    await page
      .getByRole('radio', { name: 'Código', exact: true })
      .evaluate((radio) => radio.click())
    await page.locator('textarea').fill(source)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    await page.evaluate(() => document.fonts.ready)
    const before = page.locator('.cm-md-fence-end').first()
    const after = page.locator('.cm-md-fence-start').last()
    const gap = page.locator('.cm-block-gap')
    await expect(gap).toHaveCount(1)
    const standard = (await gap.boundingBox()).height
    await gap.click()
    expect(await caretLine(page)).toBe(fence)
    await expect(page.locator('.insert-trigger')).toHaveCount(0)

    await page.locator('.cm-md-code', { hasText: 'primeiro()' }).click()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    const paragraph = page.locator('.cm-md-paragraph.cm-md-blank.cm-md-editing')
    await expect(paragraph).toBeVisible()
    expect(await caretLine(page)).toBe('')
    if (process.env.CAPTURE_BLOCK_FIX)
      await page.screenshot({
        path: `/tmp/sloth-espaco-${process.env.CAPTURE_BLOCK_FIX}-${width}.png`,
      })
    const upper = await before.boundingBox()
    const lower = await after.boundingBox()
    const empty = await paragraph.boundingBox()
    expect(empty.y - upper.y - upper.height).toBeCloseTo(standard, 0)
    expect(lower.y - empty.y - empty.height).toBeCloseTo(standard, 0)
    await page.keyboard.type('Texto novo')
    const written = await page.locator('.cm-md-paragraph', { hasText: 'Texto novo' }).boundingBox()
    expect(written.y).toBeCloseTo(empty.y, 0)
    expect((await after.boundingBox()).y).toBeCloseTo(lower.y, 0)
    await page.keyboard.press('Control+z')
    await page.keyboard.press('Control+z')
    await expect(gap).toHaveCount(1)
    await page
      .getByRole('radio', { name: 'Código', exact: true })
      .evaluate((radio) => radio.click())
    await expect(page.locator('textarea')).toHaveValue(source)
  })
}
