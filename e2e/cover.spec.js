import { expect, test } from '@playwright/test'
import { STORAGE_KEY } from '../src/storage.js'

const start = async (page, width, body = '# Viagem\n\n## Roteiro\n') => {
  await page.setViewportSize({ width, height: 844 })
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).evaluate((radio) => radio.click())
  await page.locator('textarea').fill(body)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
const source = (page) =>
  page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key) ?? '{}')
    return data.notes?.find((note) => note.id === data.activeId)?.body ?? ''
  }, STORAGE_KEY)

for (const width of [390, 1280]) {
  test(`import, use and remove a note cover at ${width}px`, async ({ page }) => {
    await start(page, width)
    await expect(page.getByRole('menuitem', { name: 'Capa da nota' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Adicionar capa' }).click()
    let picker = page.getByRole('dialog', { name: 'Capa da nota' })
    await picker.getByRole('tab', { name: 'Importar imagem' }).click()
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
    await expect(page.getByRole('button', { name: 'Adicionar capa' })).toHaveCount(0)
    const box = await cover.boundingBox()
    const pane = await page.locator('.editor-pane-primary').boundingBox()
    const title = await page.locator('.cm-line', { hasText: 'Viagem' }).first().boundingBox()
    expect(box.height).toBeLessThanOrEqual(width < 600 ? 160 : 280)
    expect(Math.abs(box.width - pane.width)).toBeLessThanOrEqual(1)
    expect(box.y + box.height).toBeLessThan(title.y)
    await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect(cover.getByRole('img')).toBeVisible()
    await expect(cover.getByRole('button', { name: 'Alterar capa' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Ações da nota' })).toHaveCount(0)
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    await cover.getByRole('button', { name: 'Alterar capa' }).click()
    picker = page.getByRole('dialog', { name: 'Capa da nota' })
    await picker.getByRole('button', { name: 'Remover' }).click()
    await expect(cover).toHaveCount(0)
    await page.getByRole('button', { name: 'Adicionar capa' }).click()
    await picker.getByRole('tab', { name: 'Importar imagem' }).click()
    await picker.getByRole('searchbox', { name: 'Busque uma imagem' }).fill('recolhivel')
    await picker.getByRole('button', { name: 'bloco-recolhivel-markdown.png' }).click()
    await expect(cover.getByRole('img')).toBeVisible()
    await page.reload()
    await expect(cover.getByRole('img')).toBeVisible()
    await expect(page.getByText('Roteiro', { exact: true }).last()).toBeVisible()
  })

  test(`a gallery cover and an emoji icon at ${width}px`, async ({ page }) => {
    await start(page, width, '# Horta\n\nPlantar alface.\n')
    await page.getByRole('button', { name: 'Adicionar ícone' }).click()
    const icons = page.getByRole('dialog', { name: 'Ícone da nota' })
    await icons.getByRole('searchbox', { name: 'Buscar emoji' }).fill('muda')
    await icons.getByRole('gridcell', { name: 'Muda de planta' }).click()
    await expect(icons).toBeHidden()
    await expect.poll(() => source(page)).toMatch(/^# 🌱 Horta\n/)
    await expect(page.getByRole('button', { name: 'Adicionar ícone' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Adicionar capa' }).click()
    const covers = page.getByRole('dialog', { name: 'Capa da nota' })
    await covers.getByRole('button', { name: 'Montanhas azuis' }).click()
    await expect(covers).toBeHidden()
    await expect(page.locator('.note-cover-banner img')).toBeVisible()
    await expect.poll(() => source(page)).toMatch(/^# 🌱 Horta\n\n!\[capa-montanha-azul\.webp\]/)
    // The note menu opens the icon panel again, and Escape gives focus back to the menu button.
    const more = page.getByRole('button', { name: 'Ações da nota' })
    await more.click()
    await page.getByRole('menuitem', { name: 'Ícone…' }).click()
    await icons.getByRole('button', { name: 'Remover' }).click()
    await expect.poll(() => source(page)).toMatch(/^# Horta\n/)
    await more.click()
    await expect(page.getByRole('menuitem', { name: 'Capa…' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(more).toBeFocused()
    await more.click()
    await page.getByRole('menuitem', { name: 'Converter em nota de tarefas' }).click()
    await expect.poll(() => source(page)).toMatch(/tipo: tarefas/)
    await more.click()
    await expect(page.getByRole('menuitem', { name: 'Converter em nota de tarefas' })).toHaveCount(
      0,
    )
  })
}

test('the add buttons show only with the pointer at the top of the note', async ({ page }) => {
  await start(page, 1280, '# Horta\n\nPlantar alface.\n')
  const add = page.getByRole('button', { name: 'Adicionar ícone' })
  await page.mouse.move(800, 600)
  await expect(add).toHaveCSS('opacity', '0')
  await page.mouse.move(800, 70)
  await expect(add).toHaveCSS('opacity', '1')
})
