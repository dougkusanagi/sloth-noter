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

test('mobile reading shows a touch arrow only for headings with content', async ({ page }) => {
  const document = newDocument()
  document.notes[0].body = '# Rascunho\n\n## Planejamento\n\nInformação interna\n\n## Vazia'
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    { key: STORAGE_KEY, document },
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="welcome"]').tap()
  const heading = page.getByRole('heading', { name: /Planejamento/ })
  const button = heading.getByRole('button', { name: 'Recolher seção' })
  expect((await button.boundingBox()).width).toBe(48)
  await expect(page.getByRole('heading', { name: 'Vazia' }).locator('.fold-toggle')).toHaveCount(0)
  await button.tap()
  await expect(page.getByText('Informação interna')).toBeHidden()
  await expect(heading.getByRole('button', { name: 'Expandir seção' })).toHaveAttribute(
    'aria-expanded',
    'false',
  )
})
