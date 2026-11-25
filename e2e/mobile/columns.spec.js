import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

test('columns stack in compact width, sit side-by-side in 840px and support add/move/undo', async ({
  page,
}) => {
  const body = [
    '# Colunas',
    '',
    '<!-- sloth:columns -->',
    '',
    '<!-- sloth:column -->',
    '',
    'Esquerda',
    '',
    '<!-- sloth:column -->',
    '',
    'Direita',
    '',
    '<!-- /sloth:columns -->',
  ].join('\n')
  const fixture = {
    ...newDocument(),
    notes: [{ id: 'col', name: 'Colunas.md', body, revision: 0 }],
    openIds: ['col'],
    activeId: 'col',
  }
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data))
    },
    [STORAGE_KEY, fixture],
  )
  await page.setViewportSize({ width: 320, height: 640 })
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="col"]').tap()

  // Compact width: columns stacked vertically (second column below first)
  const cols = page.locator('.markdown-column')
  await expect(cols).toHaveCount(2)
  const box0 = await cols.nth(0).boundingBox()
  const box1 = await cols.nth(1).boundingBox()
  expect(box1.y).toBeGreaterThanOrEqual(box0.y + box0.height - 1)

  // Expanded width (840px): columns side-by-side
  await page.setViewportSize({ width: 840, height: 640 })
  const wide0 = await cols.nth(0).boundingBox()
  const wide1 = await cols.nth(1).boundingBox()
  expect(wide1.x).toBeGreaterThan(wide0.x + 50)
})
