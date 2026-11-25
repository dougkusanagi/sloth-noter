import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

test('window classes adapt navigation rail at 600px/840px without losing route and support keyboard shortcuts', async ({
  page,
}) => {
  const fixture = {
    ...newDocument(),
    notes: [{ id: 'w1', name: 'Janela.md', body: '# Janela\n\nTexto de teste.\n', revision: 0 }],
    openIds: ['w1'],
    activeId: 'w1',
  }
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data))
    },
    [STORAGE_KEY, fixture],
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="w1"]').tap()
  await expect(page.locator('.markdown')).toContainText('Texto de teste.')

  // Switch to medium (600px) and expanded (840px): nav becomes left rail, note stays open
  await page.setViewportSize({ width: 640, height: 800 })
  const navBox = await page.locator('.mobile-bottom').boundingBox()
  expect(navBox.width).toBeLessThanOrEqual(80)
  expect(navBox.height).toBeGreaterThan(200)
  await expect(page.locator('.markdown')).toContainText('Texto de teste.')

  await page.setViewportSize({ width: 840, height: 800 })
  await expect(page.locator('.markdown')).toContainText('Texto de teste.')

  // Physical keyboard shortcut Ctrl+P opens Buscar e comandos
  await page.keyboard.press('Control+p')
  await expect(page.getByRole('dialog')).toBeVisible()
})
