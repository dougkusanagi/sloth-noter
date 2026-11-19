import { expect, test } from '@playwright/test'

// The text box, without the line padding that carries the gap between blocks.
const box = (page, text) =>
  page.evaluate((wanted) => {
    const line = [...document.querySelectorAll('.cm-content > .cm-line')].find(
      (element) => element.textContent === wanted,
    )
    const range = document.createRange()
    range.selectNodeContents(line)
    const { y, height } = range.getClientRects()[0]
    return { y, height }
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
  const line = await page.locator('.cm-md-blank.cm-md-editing').boundingBox()
  const tip = await page.locator('.insert-trigger').boundingBox()
  expect(Math.abs(tip.y - line.y)).toBeLessThan(4)
})

// Regression: with the file's final line break, Enter showed an extra empty line below.
test('Enter no último parágrafo não mostra linha vazia a mais', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'bbb' }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  const heights = await page
    .locator('.cm-content > .cm-line')
    .evaluateAll((lines) => lines.slice(-3).map((line) => line.getBoundingClientRect().height))
  expect(heights[0]).toBeLessThan(25) // gap
  expect(heights[1]).toBeGreaterThan(25) // new paragraph with the cursor
  expect(heights[2]).toBe(0) // the file's final line break
})
