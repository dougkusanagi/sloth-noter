import { expect, test } from '@playwright/test'

const openShortcuts = async (page) => {
  await page.keyboard.press('Control+,')
  const settings = page.getByRole('dialog', { name: 'Configurações', exact: true })
  await settings.getByRole('button', { name: 'Atalhos', exact: true }).click()
  return settings
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Nota\n\nUm parágrafo\n\nOutro parágrafo\n')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
})

test('o puxador do bloco usa a dica padrão com o atalho, e Ctrl+/ abre as ações', async ({
  page,
}) => {
  await page.locator('.cm-line', { hasText: 'Um parágrafo' }).hover()
  const handle = page.locator('.cm-block-handle')
  await handle.hover()
  const tip = page.getByRole('tooltip')
  await expect(tip).toContainText('Parágrafo: clique para ações, arraste para mover')
  await expect(tip.locator('kbd')).toHaveText(['Ctrl', '/'])
  await expect(handle).not.toHaveAttribute('title')
  if (process.env.CAPTURE_UI) await page.screenshot({ path: process.env.CAPTURE_UI + '-tip.png' })
  await page.locator('.cm-line', { hasText: 'Outro parágrafo' }).click()
  await page.keyboard.press('Control+/')
  await expect(page.getByRole('menu', { name: 'Ações do bloco' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu', { name: 'Ações do bloco' })).toBeHidden()
})

test('um atalho alterado nas configurações passa a valer, avisa conflitos e pode ser restaurado', async ({
  page,
}) => {
  const settings = await openShortcuts(page)
  const change = settings.getByRole('button', { name: 'Alterar o atalho de Abrir ações do bloco' })
  await change.click()
  // Ctrl+P already opens "Buscar nota".
  await page.keyboard.press('Control+p')
  await expect(settings.getByRole('alert')).toContainText('já é usado por')
  await page.keyboard.press('Control+Alt+k')
  const row = settings.getByRole('listitem').filter({ hasText: 'Abrir ações do bloco' })
  await expect(row.locator('kbd')).toHaveText(['Ctrl', 'Alt', 'K'])
  if (process.env.CAPTURE_UI)
    await page.screenshot({ path: process.env.CAPTURE_UI + '-settings.png' })
  await page.keyboard.press('Escape')
  await expect(settings).toBeHidden()

  await page.locator('.cm-line', { hasText: 'Um parágrafo' }).click()
  await page.keyboard.press('Control+/')
  await expect(page.getByRole('menu', { name: 'Ações do bloco' })).toBeHidden()
  await page.keyboard.press('Control+Alt+k')
  await expect(page.getByRole('menu', { name: 'Ações do bloco' })).toBeVisible()
  await page.keyboard.press('Escape')

  // The choice survives a reload.
  await page.reload()
  const again = await openShortcuts(page)
  const saved = again.getByRole('listitem').filter({ hasText: 'Abrir ações do bloco' })
  await expect(saved.locator('kbd')).toHaveText(['Ctrl', 'Alt', 'K'])
  await saved
    .getByRole('button', { name: 'Restaurar o atalho padrão de Abrir ações do bloco' })
    .click()
  await expect(saved.locator('kbd')).toHaveText(['Ctrl', '/'])
})
