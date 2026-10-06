import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const src =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII='

test.beforeEach(async ({ page }) => {
  const document = newDocument()
  document.notes = [
    { id: 'target', name: 'Destino.md', body: '# Destino\n\nAntes\n\nDepois', revision: 1 },
  ]
  document.openIds = ['target']
  document.activeId = 'target'
  document.assets = [{ src, name: 'Biblioteca.png' }]
  await page.addInitScript(
    ({ document, key }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(document))
    },
    { document, key: STORAGE_KEY },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.keyboard.press('Control+Shift+l')
  await expect(page.locator('.image-item')).toHaveCount(1)
})

for (const mode of ['visual', 'source']) {
  test(`dragging a library image reuses the asset in the ${mode} document`, async ({ page }) => {
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const target = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    if (mode === 'source') {
      await target.focus()
      await page.keyboard.press('Control+End')
      await page.keyboard.press('Home')
    }
    const item = await page.locator('.image-item img').boundingBox()
    const destination =
      mode === 'visual'
        ? await page.locator('.cm-line').filter({ hasText: 'Depois' }).boundingBox()
        : await target.boundingBox()
    await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2)
    await page.mouse.down()
    await page.mouse.move(destination.x + 2, destination.y + 10, { steps: 10 })
    await expect(page.locator('.image-drag-preview')).toBeVisible()
    await page.mouse.up()
    await expect(page.locator('.image-drag-preview')).toHaveCount(0)
    await expect(page.locator('.image-details')).toHaveCount(0)
    if (mode === 'visual')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(
      `# Destino\n\nAntes\n\n![Biblioteca.png](${src})\nDepois`,
    )
    await expect(page.locator('.image-item')).toHaveCount(1)
    await page.locator('.image-item').click({ button: 'right' })
    await expect(page.getByRole('menuitem', { name: 'Excluir imagem', exact: true })).toBeDisabled()
    await expect(page.locator('#image-delete-reason')).toContainText('notas e na lixeira')
  })
}

test('unused images can be deleted directly from the library and stay removed after reload', async ({
  page,
}) => {
  await page.locator('.image-item').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Excluir imagem', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Excluir imagem', exact: true })
    .click()
  await expect(page.locator('.image-item')).toHaveCount(0)
  await page.reload()
  await page.keyboard.press('Control+Shift+l')
  await expect(page.locator('.image-item')).toHaveCount(0)
})

test('the manage action exposes rename, download and delete', async ({ page }) => {
  await page.locator('.image-item').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Renomear imagem', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Baixar imagem', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Excluir imagem', exact: true })).toBeEnabled()
})

test('image context menu is keyboard accessible and Escape restores focus', async ({ page }) => {
  const item = page.locator('.image-item')
  await item.focus()
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menuitem', { name: 'Inserir na nota' })).toBeFocused()
  await page.keyboard.press('End')
  await expect(page.getByRole('menuitem', { name: 'Excluir imagem', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(item).toBeFocused()
})
