import { expect, test } from '@playwright/test'

const BODY = [
  '# Notas',
  '',
  '## Seção um',
  '',
  '- item',
  '    - filho',
  '        - neto',
  '    - filho dois',
  '- outro',
  '',
  '### Sub um-a',
  '',
  'texto sub',
  '',
  '## Seção dois',
  '',
  'Fim',
].join('\n')
const box = (page) => page.getByRole('textbox', { name: 'Editor Markdown em texto puro' })

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1400 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await box(page).fill(BODY)
})

test('Padrão draws continuous rails only for nested lists, one per nesting level', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const rails = page.locator('.cm-rail')
  // "item" holds a list and "filho" holds one too; sections get no rail.
  await expect(rails).toHaveCount(2)
  await expect(rails.first()).toHaveCSS('border-left-style', 'solid')
  const boxes = await rails.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().toJSON()),
  )
  const line = (text) =>
    page
      .locator('.cm-line', { hasText: text })
      .first()
      .evaluate((element) => element.getBoundingClientRect().toJSON())
  const [outer, inner] = boxes.sort((a, b) => a.left - b.left)
  expect(inner.left).toBeGreaterThan(outer.left)
  // The outer rail spans the sublist: from "filho" down to "filho dois".
  const first = await line('filho')
  const last = await line('filho dois')
  expect(Math.abs(outer.top - first.top)).toBeLessThan(1)
  expect(Math.abs(outer.bottom - last.bottom)).toBeLessThan(1)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(BODY)
})

test('Leitura draws the same rails for nested lists and none for sections', async ({ page }) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const pseudo = (selector, property) =>
    page
      .locator(selector)
      .first()
      .evaluate(
        (element, name) =>
          getComputedStyle(element, element.matches('li') ? '::after' : '::before')[name],
        property,
      )
  expect(await pseudo('.markdown li:has(> ul)', 'borderLeftStyle')).toBe('solid')
  expect(await pseudo('.markdown .md-section', 'content')).toBe('none')
})
