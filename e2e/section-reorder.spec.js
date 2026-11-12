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

const center = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
const handleOf = async (page, text) => {
  await page.locator('.cm-line', { hasText: text }).hover()
  const handle = page.locator('.cm-block-handle')
  await expect(handle).toBeVisible()
  return handle
}
// Drags a block's handle to a point; `below` drops after the target block.
const drag = async (page, text, target, below = false) => {
  const from = center(await (await handleOf(page, text)).boundingBox())
  const box = await page.locator('.cm-line', { hasText: target }).boundingBox()
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(box.x + 20, below ? box.y + box.height - 2 : box.y + 2, { steps: 8 })
  await expect(page.locator('.cm-section-drop')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.cm-section-drop')).toBeHidden()
}

test('dragging an open heading moves only the heading line', async ({ page }) => {
  await drag(page, 'Primeira', 'tarefa c', true)
  await source(
    page,
    [
      '# Notas',
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
      '',
      '## Primeira',
    ].join('\n'),
  )
})

test('dragging a folded heading moves its whole section', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Primeira' })
  await heading.hover()
  await heading.getByRole('button', { name: 'Recolher seção' }).click()
  await drag(page, 'Primeira', 'tarefa c', true)
  await expect(page.locator('.cm-line', { hasText: 'tarefa a' })).toHaveCount(0)
  await source(page, END)
})

test('a folded section stays folded after moving up', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Segunda' })
  await heading.hover()
  await heading.getByRole('button', { name: 'Recolher seção' }).click()
  await drag(page, 'Segunda', 'Primeira')
  await expect(page.locator('.cm-line', { hasText: 'tarefa b' })).toHaveCount(0)
  await expect(page.locator('.cm-fold-toggle.folded')).toHaveCount(1)
  await source(page, UP)
})

test('dragging a paragraph moves just that paragraph', async ({ page }) => {
  await drag(page, 'tarefa c', 'Primeira')
  await source(
    page,
    [
      '# Notas',
      '',
      'tarefa c',
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
    ].join('\n'),
  )
})

test('a click on the handle opens the block menu without moving anything', async ({ page }) => {
  const handle = await handleOf(page, 'Segunda')
  await handle.click()
  const menu = page.getByRole('menu', { name: 'Ações do bloco' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitemradio', { name: 'Título 2' })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await source(page, NOTE)
})

test('the handle sits next to the fold arrow of a heading', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Primeira' })
  const handle = await handleOf(page, 'Primeira')
  const fold = await heading.locator('.cm-fold-toggle').boundingBox()
  const box = await handle.boundingBox()
  const gap = fold.x - (box.x + box.width)
  expect(gap).toBeGreaterThanOrEqual(1)
  expect(gap).toBeLessThanOrEqual(8)
  expect(box.height).toBeGreaterThanOrEqual(24)
})

test('hovering anywhere on a block row shows its handle', async ({ page }) => {
  const heading = page.locator('.cm-line', { hasText: 'Primeira' })
  const row = await heading.boundingBox()
  const handle = page.locator('.cm-block-handle')
  for (const x of [row.x + 5, row.x + row.width - 10]) {
    await page.mouse.move(5, 5)
    await expect(handle).toBeHidden()
    await page.mouse.move(x, row.y + row.height / 2)
    await expect(handle).toBeVisible()
  }
})
