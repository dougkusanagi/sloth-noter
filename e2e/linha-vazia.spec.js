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
