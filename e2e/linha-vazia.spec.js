import { expect, test } from '@playwright/test'

// Regression: the empty line made by Enter after a code block must look like a normal paragraph.
test('linha vazia ativa depois de um bloco de código tem altura e espaço de parágrafo', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Título\n\n```\ncódigo\n```\n\nabc\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  const blank = page.locator('.cm-md-fence-end + .cm-md-blank')
  await expect(blank).toBeVisible()
  await blank.click()
  await expect(blank).toHaveClass(/cm-md-editing/)
  const para = page.locator('.cm-md-paragraph:not(.cm-md-blank)')
  const paraHeight = (await para.boundingBox()).height
  await expect.poll(async () => (await blank.boundingBox()).height).toBeCloseTo(paraHeight, 0)
  const margin = await blank.evaluate((el) => parseFloat(getComputedStyle(el).marginTop))
  expect(margin).toBeGreaterThan(10)
})
