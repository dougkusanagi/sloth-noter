import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../../src/storage.js'

test('mobile note menu sets a cover from the image library', async ({ page }) => {
  const document = newDocument()
  document.notes[0].body = '# Viagem\n\nRoteiro\n'
  document.assets = [
    {
      name: 'Recife.png',
      src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
    },
  ]
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    { key: STORAGE_KEY, document },
  )
  await page.goto('/?platform=mobile')
  await page.locator('[data-note-id="welcome"]').tap()
  await page.getByRole('button', { name: /Ações.*Viagem/i }).tap()
  await page.getByRole('button', { name: 'Capa da nota' }).tap()
  const picker = page.getByRole('dialog', { name: 'Capa da nota' })
  await picker.getByRole('button', { name: 'Recife.png' }).tap()
  await expect(picker).toBeHidden()
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar', exact: true }).tap()
  const cover = page.locator('.mobile-content .note-cover')
  await expect(cover.getByRole('img', { name: 'Recife.png' })).toBeVisible()
  expect((await cover.boundingBox()).height).toBeLessThanOrEqual(128)
  await expect(page.getByText('Roteiro', { exact: true })).toBeVisible()
})
