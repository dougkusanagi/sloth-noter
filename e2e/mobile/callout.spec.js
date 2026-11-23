import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

test('mobile reading preserves callout titles and Markdown formatting', async ({ page }) => {
  const document = newDocument()
  document.notes[0].body =
    '# Manual\n\n> [!CAUTION] Anexos privados\n> Sempre **revise** os anexos.\n\nTexto seguinte.'
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    { key: STORAGE_KEY, document },
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="welcome"]').click()
  const alert = page.locator('.markdown [data-callout="caution"]')
  await expect(alert.locator('.callout-title')).toHaveText('Anexos privados')
  await expect(alert.locator('strong')).toHaveText('revise')
  await expect(page.getByText('Texto seguinte.')).toBeVisible()
  if (process.env.CAPTURE_CALLOUT) await page.screenshot({ path: '/tmp/sloth-callout-mobile.png' })
})
