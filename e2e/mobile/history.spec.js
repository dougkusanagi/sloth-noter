import { expect, test } from '@playwright/test'
import { STORAGE_KEY, newDocument } from '../../src/storage.js'

test('version history can be explicitly enabled in mobile settings', async ({ page }) => {
  const fixture = {
    ...newDocument(),
    notes: [{ id: 'h1', name: 'Hist.md', body: '# Hist\n\nVersão inicial.\n', revision: 0 }],
    openIds: ['h1'],
    activeId: 'h1',
  }
  await page.addInitScript(
    ([key, data]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data))
    },
    [STORAGE_KEY, fixture],
  )
  await page.goto('/?platform=mobile')
  await page.getByRole('button', { name: 'Mais opções', exact: true }).tap()
  await page.getByRole('dialog').getByRole('button', { name: 'Configurações', exact: true }).tap()
  const toggle = page.locator('#settings-history')
  await expect(toggle).toBeVisible()
  await expect(toggle).not.toBeChecked()
  await toggle.click()
  await expect(toggle).toBeChecked()
})
