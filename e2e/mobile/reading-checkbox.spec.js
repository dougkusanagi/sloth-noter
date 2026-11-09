import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'
test('task checkboxes stay inside the scroll area without line wrapping', async ({ page }) => {
  await page.addInitScript(({ key, doc }) => localStorage.setItem(key, JSON.stringify(doc)), {
    key: STORAGE_KEY,
    doc: {
      ...newDocument(),
      notes: [
        {
          id: 'a',
          name: 'Teste.md',
          body:
            '# Teste\nO que fazer\n\n- [ ] Uma tarefa\n  - [ ] Subtarefa com ' +
            'conteúdo '.repeat(30),
          revision: 0,
        },
      ],
      openIds: ['a'],
      activeId: 'a',
      preferences: { ...newDocument().preferences, wrapLines: false },
    },
  })
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="a"]').click()
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 })
    const boxes = page.locator('.markdown input[type=checkbox]')
    await expect(boxes).toHaveCount(2)
    for (let index = 0; index < 2; index++) {
      const box = await boxes.nth(index).boundingBox()
      const row = await boxes.nth(index).locator('..').boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(row.x)
      await boxes.nth(index).check()
      await expect(boxes.nth(index)).toBeChecked()
      await boxes.nth(index).uncheck()
    }
    await page.screenshot({ path: `/tmp/sloth-checkbox-${width}.png` })
  }
})
