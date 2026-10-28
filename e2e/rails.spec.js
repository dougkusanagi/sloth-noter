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

test('Padrão drops the rails of a section while it is collapsed', async ({ page }) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const rails = page.locator('.cm-rail')
  await expect(rails).toHaveCount(2)
  const heading = page.locator('.cm-line', { hasText: 'Seção um' })
  await heading.hover()
  await heading.getByRole('button', { name: 'Recolher seção' }).click()
  await expect(page.locator('.cm-line', { hasText: 'filho' })).toHaveCount(0)
  await expect(rails).toHaveCount(0)
  await heading.hover()
  await heading.getByRole('button', { name: 'Expandir seção' }).click()
  await expect(rails).toHaveCount(2)
})

test('Leitura draws the same rails as Padrão, aligned with the nested items', async ({ page }) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.visual-editor.read-only')).toBeVisible()
  const rails = page.locator('.cm-rail')
  await expect(rails).toHaveCount(2)
  const top = (locator) => locator.evaluate((element) => element.getBoundingClientRect().top)
  const outer = () =>
    rails.evaluateAll((elements) => Math.min(...elements.map((e) => e.getBoundingClientRect().top)))
  const filho = page.locator('.cm-line', { hasText: 'filho' }).first()
  await expect.poll(async () => Math.abs((await outer()) - (await top(filho)))).toBeLessThan(1)
})
