import { expect, test } from '@playwright/test'

const BODY = [
  '# Notas',
  '',
  '## Primeira',
  '',
  'tarefa a',
  '',
  '## Segunda',
  '',
  'tarefa b',
  '',
  '## Terceira',
  '',
  'tarefa c',
].join('\n')
const NOTE = BODY
const UP = [
  '# Notas',
  '',
  '## Segunda',
  '',
  'tarefa b',
  '',
  '## Primeira',
  '',
  'tarefa a',
  '',
  '## Terceira',
  '',
  'tarefa c',
].join('\n')
const DOWN = [
  '# Notas',
  '',
  '## Primeira',
  '',
  'tarefa a',
  '',
  '## Terceira',
  '',
  'tarefa c',
  '',
  '## Segunda',
  '',
  'tarefa b',
].join('\n')
const END = [
  '# Notas',
  '',
  '## Segunda',
  '',
  'tarefa b',
  '',
  '## Terceira',
  '',
  'tarefa c',
  '',
  '## Primeira',
  '',
  'tarefa a',
].join('\n')
const box = (page) => page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })
// The caret's visual line, read straight from the browser selection.
const caretLine = (page) =>
  page.evaluate(
    () =>
      window.getSelection()?.anchorNode?.parentElement?.closest?.('.cm-line')?.textContent ?? '',
  )
// Clicking a line can park the caret elsewhere, so navigation goes by keys.
const reachLine = async (page, text) => {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Home')
  for (let steps = 0; steps < 30; steps++) {
    const line = await caretLine(page)
    if (line.includes(text)) return
    await page.keyboard.press('ArrowDown')
  }
  throw new Error(`the caret never reached a line with "${text}"`)
}
// Switches to the source view and pins the note's current text.
const source = async (page, text) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(text)
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(BODY)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
})

test('Ctrl+Shift+Arrow moves the whole section the caret is on', async ({ page }) => {
  await reachLine(page, 'Segunda')
  await page.keyboard.press('Control+Shift+ArrowUp')
  await source(page, UP)
  // Coming back from Código keeps the caret free to move it again.
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await reachLine(page, 'Segunda')
  await page.keyboard.press('Control+Shift+ArrowDown')
  await source(page, BODY)
})

test('Ctrl+Shift+Arrow on a heading keeps its fold state', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Segunda' })
  await heading.hover()
  await heading.getByRole('button', { name: 'Recolher seção' }).click()
  await expect(page.locator('.cm-line', { hasText: 'tarefa b' })).toHaveCount(0)
  await reachLine(page, 'Segunda')
  await page.keyboard.press('Control+Shift+ArrowUp')
  // The section travels folded.
  await expect(page.locator('.cm-line', { hasText: 'tarefa b' })).toHaveCount(0)
  await source(page, UP)
})

test('Ctrl+Shift+Arrow on list rows still moves list items', async ({ page }) => {
  const text = ['# Notas', '', '## Seção', '', '- um', '- dois', '- três'].join('\n')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await reachLine(page, 'dois')
  await page.keyboard.press('Control+Shift+ArrowUp')
  await source(page, ['# Notas', '', '## Seção', '', '- dois', '- um', '- três'].join('\n'))
})

test('a heading with an empty body moves without losing the section', async ({ page }) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(BODY.replace('tarefa b\n\n', ''))
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await reachLine(page, 'Segunda')
  await page.keyboard.press('Control+Shift+ArrowUp')
  await source(
    page,
    [
      '# Notas',
      '',
      '## Segunda',
      '',
      '## Primeira',
      '',
      'tarefa a',
      '',
      '## Terceira',
      '',
      'tarefa c',
    ].join('\n'),
  )
})

test('dragging the grip reorders sections with a drop line', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Primeira' })
  await heading.hover()
  const grip = heading.locator('.cm-drag-handle')
  const from = await grip.boundingBox()
  const target = await page.locator('.cm-line', { hasText: 'tarefa c' }).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await expect(page.locator('.cm-section-drop')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.cm-section-drop')).toBeHidden()
  await source(page, END)
})

test('releasing the grip without moving leaves the note alone', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Primeira' })
  await heading.hover()
  const grip = heading.locator('.cm-drag-handle')
  const from = await grip.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2, { steps: 2 })
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2, { steps: 2 })
  await page.mouse.up()
  await source(page, NOTE)
})

test('dragging a section down one slot', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Segunda' })
  await heading.hover()
  const grip = heading.locator('.cm-drag-handle')
  const from = await grip.boundingBox()
  // A slot is crossed at the target block's midpoint, so dropping below the
  // midpoint of Terceira's block (its tail line) moves past Terceira.
  const target = await page.locator('.cm-line', { hasText: 'tarefa c' }).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await page.mouse.up()
  await source(page, DOWN)
})

test('folding follows a dragged section and others keep their folds', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Segunda' })
  await heading.hover()
  await heading.getByRole('button', { name: 'Recolher seção' }).click()
  await expect(page.locator('.cm-line', { hasText: 'tarefa b' })).toHaveCount(0)
  // Moving a different section keeps Segunda folded, mapped across the change.
  const first = page.locator('.cm-line', { hasText: 'Primeira' })
  await first.hover()
  const grip = first.locator('.cm-drag-handle')
  const from = await grip.boundingBox()
  const target = await page.locator('.cm-line', { hasText: 'tarefa c' }).evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  })
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x, target.y, { steps: 8 })
  await page.mouse.up()
  await source(
    page,
    [
      '# Notas',
      '',
      '## Segunda',
      '',
      'tarefa b',
      '',
      '## Terceira',
      '',
      'tarefa c',
      '',
      '## Primeira',
      '',
      'tarefa a',
    ].join('\n'),
  )
})

test('the grip only shows where a heading has siblings', async ({ page }) => {
  await expect(page.locator('.cm-drag-handle')).toHaveCount(3)
  // The gutter only fits the grip past the content column.
  await page.setViewportSize({ width: 800, height: 1400 })
  await expect(page.locator('.cm-drag-handle').first()).toBeHidden()
})

test('dragging the first section after the second does not skip to the end', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Primeira' })
  await heading.hover()
  const from = await heading.locator('.cm-drag-handle').boundingBox()
  const target = await page.locator('.cm-line', { hasText: 'tarefa b' }).boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 })
  await page.mouse.up()
  await source(page, UP)
})
