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
  await expect(page.locator('.mobile-shell')).toHaveCSS('padding-left', '64px')
  const navBox = await page.locator('.mobile-bottom').boundingBox()
  expect(navBox.width).toBeLessThanOrEqual(80)
  expect(navBox.height).toBeGreaterThan(200)

  // Header and content must sit to the right of the left navigation rail without overlap
  const headerBox = await page.locator('.mobile-header').boundingBox()
  const contentBox = await page.locator('.mobile-content').boundingBox()
  expect(headerBox.x).toBeGreaterThanOrEqual(navBox.x + navBox.width - 1)
  expect(contentBox.x).toBeGreaterThanOrEqual(navBox.x + navBox.width - 1)

  // Navigation buttons must stack vertically inside the rail without spilling into the content
  const navButtons = page.locator('.mobile-bottom button')
  const count = await navButtons.count()
  expect(count).toBeGreaterThanOrEqual(3)
  let previousBottom = -1
  for (let i = 0; i < count; i++) {
    const btnBox = await navButtons.nth(i).boundingBox()
    expect(btnBox.x).toBeGreaterThanOrEqual(navBox.x - 1)
    expect(btnBox.x + btnBox.width).toBeLessThanOrEqual(navBox.x + navBox.width + 1)
    expect(btnBox.y).toBeGreaterThanOrEqual(previousBottom - 1)
    previousBottom = btnBox.y + btnBox.height
  }

  await expect(page.locator('.markdown')).toContainText('Texto de teste.')

  await page.setViewportSize({ width: 840, height: 800 })
  await expect(page.locator('.markdown')).toContainText('Texto de teste.')

  // Physical keyboard shortcut Ctrl+P opens Buscar e comandos
  await page.keyboard.press('Control+p')
  await expect(page.getByRole('dialog')).toBeVisible()
})
