import { expect, test } from '@playwright/test'

const body =
  '# Lista\n\n- Um\n  - Dois\n    - Três\n\n---\n\nTexto com [link](https://exemplo.com) e `código`.\n'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(body)
})

test('Padrão shows a different bullet for each list level', async ({ page }) => {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-line', { hasText: 'Texto com' }).click()
  const marks = await page
    .locator('.cm-md-bullet')
    .evaluateAll((lines) => lines.map((line) => getComputedStyle(line, '::before').content))
  expect(marks).toEqual(['"•"', '"◦"', '"▪"'])
})

test('Leitura shows the same bullet shapes and the same short separator', async ({ page }) => {
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  const marks = await page
    .locator('.visual-editor.read-only .cm-md-bullet')
    .evaluateAll((lines) => lines.map((line) => getComputedStyle(line, '::before').content))
  expect(marks).toEqual(['"•"', '"◦"', '"▪"'])
  await expect(page.locator('.visual-editor.read-only .cm-md-rule')).toHaveCSS(
    'background-size',
    '30% 1px',
  )
})

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII='

for (const mode of ['Padrão', 'Leitura']) {
  test(`${mode} shows the Markdown image title as a caption`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill(`# Foto\n\n![Pixel](${png} "Legenda da figura")\n\nFim\n`)
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    if (mode === 'Padrão') await page.locator('.cm-line', { hasText: 'Fim' }).click()
    await expect(page.locator('.cm-image-caption')).toHaveText('Legenda da figura')
    await expect(page.locator('.cm-image-figure img')).toBeVisible()
  })
}
