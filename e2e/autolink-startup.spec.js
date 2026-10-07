import { expect, test } from '@playwright/test'

test('reopening a note with automatic email and URL links keeps the interface visible', async ({
  page,
}) => {
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const body = '# Contatos\n\nuser@example.com\n\nhttps://example.com\n\n<https://example.com>'
  await page.locator('textarea').fill(body)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.locator('.cm-md-inline-link')).toHaveCount(3)
  await page.reload()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.locator('.cm-md-inline-link')).toHaveCount(3)
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await expect(page.locator('textarea')).toHaveValue(body)
  expect(errors).toEqual([])
})
