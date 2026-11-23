import { expect, test } from '@playwright/test'
import { accordionTemplate } from '../../src/accordion.js'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

test('mobile reading opens and closes an accordion without modifying the note', async ({
  page,
}) => {
  const document = newDocument()
  document.notes[0].body =
    '# Rascunho\n\n' + accordionTemplate('Planejamento', 'Informação interna') + '\n\nDepois'
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    {
      key: STORAGE_KEY,
      document,
    },
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="welcome"]').click()
  const accordion = page.locator('.markdown details.markdown-accordion')
  await expect(accordion).toHaveAttribute('open', '')
  await accordion.locator('summary').click()
  await expect(accordion.getByText('Informação interna')).toBeHidden()
  await expect(page.getByText('Depois', { exact: true })).toBeVisible()
  await page.screenshot({ path: '/tmp/sloth-bloco-mobile.png' })
  await accordion.locator('summary').click()
  await expect(accordion.getByText('Informação interna')).toBeVisible()
})
