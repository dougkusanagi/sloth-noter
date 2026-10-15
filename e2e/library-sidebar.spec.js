import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('trash is a searchable library and permanent deletion still needs confirmation', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Mover para a lixeira/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Mover', exact: true }).click()
  const sidebar = page.getByRole('complementary', { name: 'Biblioteca' })
  await sidebar.getByRole('button', { name: /^Lixeira/ }).click()
  const trash = sidebar.getByRole('region', { name: 'Lixeira', exact: true })
  await expect(trash.getByRole('article', { name: 'Welcome' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await sidebar.getByRole('textbox', { name: 'Buscar na biblioteca…' }).fill('inexistente')
  await expect(trash).toContainText('Nenhum resultado')
  await sidebar.getByRole('textbox').fill('Welcome')
  await trash.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(trash.getByRole('article')).toHaveCount(1)
  await trash.getByRole('button', { name: 'Excluir definitivamente', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir', exact: true }).click()
  await expect(trash).toContainText('A lixeira está vazia.')
})

test('images import sits beside search and keyboard shortcuts retain keycaps', async ({ page }) => {
  await page.keyboard.press('Control+Shift+l')
  const sidebar = page.locator('#notes-sidebar')
  expect((await sidebar.boundingBox()).width).toBe(312)
  const search = await sidebar.getByRole('textbox').boundingBox()
  const add = await sidebar
    .getByRole('button', { name: 'Adicionar imagens', exact: true })
    .boundingBox()
  expect(Math.abs(search.y - add.y)).toBeLessThan(10)
  expect(add.x).toBeGreaterThan(search.x + search.width)
  await expect(sidebar.getByRole('button', { name: 'Atualizar imagens', exact: true })).toHaveCount(
    0,
  )
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  const key = page.locator('.adjustment-buttons kbd').first()
  await key.scrollIntoViewIfNeeded()
  expect(await key.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
    'rgba(0, 0, 0, 0)',
  )
  await expect(
    page.locator('.adjustment-buttons .menu-shortcut').first().locator('kbd'),
  ).toHaveCount(2)
  await page.keyboard.press('Escape')
  await page.screenshot({ path: 'test-results/library-sidebar.png' })
})
