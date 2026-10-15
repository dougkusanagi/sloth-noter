import { expect, test } from '@playwright/test'

const box = (page) => page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })
const left = (locator) => locator.evaluate((element) => element.getBoundingClientRect().left)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
})

test('Tab on task items nests them in Padrão once the cursor leaves, with no visible spaces', async ({
  page,
}) => {
  await box(page).fill('# Tarefas\n\n- [ ] a\n- [ ] b\n1. um\n2. dois\n\nfim')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: /^b$/ }).click()
  await page.keyboard.press('Tab')
  // While the item is being edited its spaces are not drawn either: nothing jumps afterwards.
  await expect(page.locator('.cm-line.cm-md-editing')).toHaveText('- [ ] b')
  await page.locator('.cm-line', { hasText: 'dois' }).click()
  await page.keyboard.press('Tab')
  await expect(page.locator('.cm-line.cm-md-editing')).toHaveText('1. dois')
  await page.locator('.cm-line', { hasText: /^fim$/ }).click()
  const boxes = page.locator('.cm-task-checkbox')
  await expect(boxes).toHaveCount(2)
  expect(await left(boxes.nth(1))).toBeGreaterThan((await left(boxes.nth(0))) + 10)
  const ordered = page.locator('.cm-md-ordered')
  await expect(ordered).toHaveCount(2)
  expect(await left(ordered.nth(1))).toBeGreaterThan((await left(ordered.nth(0))) + 10)
  await expect(ordered.nth(1)).toHaveText('1. dois')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(
    '# Tarefas\n\n- [ ] a\n    - [ ] b\n1. um\n    1. dois\n\nfim',
  )
})

test('nesting depends on the list structure, not on how many spaces the source uses', async ({
  page,
}) => {
  await box(page).fill('# L\n\n- a\n  - dois espaços\n- b\n    - quatro espaços\n\nfim')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const bullets = page.locator('.cm-md-bullet')
  await expect(bullets).toHaveCount(4)
  expect(await left(bullets.nth(1))).toBe(await left(bullets.nth(3)))
  expect(await left(bullets.nth(1))).toBeGreaterThan(await left(bullets.nth(0)))
})

test('a paragraph continuing a list item lines up with the item text', async ({ page }) => {
  await box(page).fill('# L\n\n- item\n  continuação\n\nfim')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const textLeft = (text) =>
    page
      .locator('.cm-line', { hasText: text })
      .first()
      .evaluate((element) => {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const node = walker.nextNode()
        const range = document.createRange()
        range.selectNodeContents(node)
        return range.getBoundingClientRect().left
      })
  expect(await textLeft('continuação')).toBeCloseTo(await textLeft('item'), 0)
})
