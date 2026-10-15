import { expect, test } from '@playwright/test'

const BODY = [
  '# Notas',
  '',
  'Intro',
  '',
  '## Seção um',
  '',
  'texto um',
  '',
  '- item',
  '    - filho',
  '        - neto',
  '',
  '### Sub um-a',
  '',
  'texto sub',
  '',
  '## Seção dois',
  '',
  'texto dois',
  '',
  '## Vazia',
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

test('Padrão draws dotted rails for nested sections and nested lists outside the text column', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const rails = page.locator('.cm-rail')
  // Seção um, Sub um-a, Seção dois, Vazia (content: "Fim") and two list levels.
  await expect(rails).toHaveCount(6)
  await expect(rails.first()).toHaveCSS('border-left-style', 'dotted')
  const boxes = await rails.evaluateAll((elements) =>
    elements.map((element) => {
      const { left, top, height } = element.getBoundingClientRect()
      return { left, top, height }
    }),
  )
  const text = await page
    .locator('.cm-line', { hasText: 'texto um' })
    .evaluate((element) => element.getBoundingClientRect().left)
  const outer = boxes.filter((rail) => rail.left < text)
  // The two section rails around "Sub um-a" are left of the text; the outer one is further left.
  expect(outer.length).toBeGreaterThanOrEqual(4)
  expect(Math.min(...outer.map((rail) => rail.left))).toBeLessThan(text - 8)
  // Rails never move the text.
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(box(page)).toHaveValue(BODY)
})

test('a section rail starts at its heading and stops at its last line of content', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  const lineBox = (text) =>
    page
      .locator('.cm-line', { hasText: text })
      .first()
      .evaluate((element) => {
        const { top, bottom } = element.getBoundingClientRect()
        return { top, bottom }
      })
  const heading = await lineBox('Seção dois')
  const last = await lineBox('texto dois')
  const rails = await page
    .locator('.cm-rail')
    .evaluateAll((elements) => elements.map((e) => e.getBoundingClientRect().toJSON()))
  const rail = rails.find((candidate) => Math.abs(candidate.top - heading.top) < 1)
  expect(rail).toBeTruthy()
  expect(Math.abs(rail.bottom - last.bottom)).toBeLessThan(1)
})

test('Leitura draws the same kinds of rails', async ({ page }) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const pseudo = (selector, property) =>
    page
      .locator(selector)
      .first()
      .evaluate((element, name) => getComputedStyle(element, '::before')[name], property)
  expect(await pseudo('.markdown .md-section', 'borderLeftStyle')).toBe('dotted')
  expect(await pseudo('.markdown li > ul', 'borderLeftStyle')).toBe('dotted')
  const left = (selector) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element, '::before').left))
  // The section holding a subsection has its rail further out than a leaf section's.
  const outer = await page
    .locator('.md-section')
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e, '::before').left))
  const inner = await page
    .locator('.md-section .md-section')
    .first()
    .evaluate((e) => parseFloat(getComputedStyle(e, '::before').left))
  expect(outer).toBeLessThan(inner)
  expect(await left('.markdown li > ul')).toBeLessThan(0)
})
