import { expect, test } from '@playwright/test'

const openCover = async (page) => {
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Capa da nota' }).click()
  return page.getByRole('dialog', { name: 'Capa da nota' })
}

for (const width of [390, 1280]) {
  test(`import, use and remove a note cover at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page
      .getByRole('radio', { name: 'Código', exact: true })
      .evaluate((radio) => radio.click())
    await page.locator('textarea').fill('# Viagem\n\n## Roteiro\n')
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    let picker = await openCover(page)
    await picker.locator('input[type="file"]').setInputFiles({
      name: 'invalida.png',
      mimeType: 'image/png',
      buffer: Buffer.from('arquivo sem imagem'),
    })
    await expect(picker.getByRole('alert')).toBeVisible()
    await picker
      .locator('input[type="file"]')
      .setInputFiles('public/changelog/bloco-recolhivel-markdown.png')
    await expect(picker).toBeHidden()
    const cover = page.locator('.note-cover-banner')
    await expect(cover.getByRole('img')).toBeVisible()
    // The cover sits at the top, edge to edge, and the Markdown line is not drawn again.
    await expect(page.locator('.cm-content .note-cover')).toHaveCount(0)
    const box = await cover.boundingBox()
    const pane = await page.locator('.editor-pane-primary').boundingBox()
    const title = await page.locator('.cm-line', { hasText: 'Viagem' }).first().boundingBox()
    expect(box.height).toBeLessThanOrEqual(width < 600 ? 160 : 280)
    expect(Math.abs(box.width - pane.width)).toBeLessThanOrEqual(1)
    expect(box.y + box.height).toBeLessThan(title.y)
    await cover.getByRole('button', { name: 'Alterar capa' }).click()
    await page.getByRole('dialog', { name: 'Capa da nota' }).press('Escape')
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(cover.getByRole('img')).toBeVisible()
    await expect(cover.getByRole('button', { name: 'Alterar capa' })).toHaveCount(0)
    picker = await openCover(page)
    await picker.getByRole('button', { name: 'Remover capa' }).click()
    await expect(cover).toHaveCount(0)
    picker = await openCover(page)
    await picker.getByRole('searchbox', { name: 'Busque uma imagem' }).fill('recolhivel')
    await picker.getByRole('button', { name: 'bloco-recolhivel-markdown.png' }).click()
    await expect(cover.getByRole('img')).toBeVisible()
    await page.reload()
    await expect(cover.getByRole('img')).toBeVisible()
    await expect(page.getByText('Roteiro', { exact: true }).last()).toBeVisible()
  })
}
