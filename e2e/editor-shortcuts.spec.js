import { expect, test } from '@playwright/test'

async function open(page, mode, body = '# Atalhos\n\ntexto') {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(body)
  if (mode === 'visual')
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}
const body = (page) => page.evaluate(() => JSON.parse(localStorage['sloth-note:v3']).notes[0].body)

for (const mode of ['visual', 'source']) {
  test(`formatting shortcuts wrap the selection in ${mode} mode`, async ({ page }) => {
    await open(page, mode)
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Home')
    await page.keyboard.press('Control+b')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\n**texto**')
    await page.keyboard.press('Control+b')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\ntexto')
    await page.keyboard.press('Control+i')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\n*texto*')
    await page.keyboard.press('Control+i')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\ntexto')
    await page.keyboard.press('Control+Shift+x')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\n~~texto~~')
    await page.keyboard.press('Control+Shift+x')
    await page.keyboard.press('Control+k')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\n[texto]()')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test(`bold and italic combine and unwind without piling up asterisks in ${mode} mode`, async ({
    page,
  }) => {
    await open(page, mode)
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Home')
    const steps = [
      ['Control+b', '**texto**'],
      ['Control+i', '***texto***'],
      ['Control+i', '**texto**'],
      ['Control+i', '***texto***'],
      ['Control+b', '*texto*'],
      ['Control+i', 'texto'],
    ]
    for (const [keys, expected] of steps) {
      await page.keyboard.press(keys)
      await expect.poll(() => body(page)).toBe(`# Atalhos\n\n${expected}`)
    }
    // Repeating the same shortcut many times never grows the markers.
    for (let i = 0; i < 6; i++) await page.keyboard.press('Control+i')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\ntexto')
  })

  test(`an empty cursor gets a pair to type inside in ${mode} mode`, async ({ page }) => {
    await open(page, mode)
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Control+b')
    await page.keyboard.type('forte')
    await expect.poll(() => body(page)).toBe('# Atalhos\n\ntexto**forte**')
  })
}

test('Ctrl+Shift+F searches every note and Ctrl+Alt+F toggles focus mode', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.keyboard.press('Control+Shift+f')
  await expect(page.getByRole('textbox', { name: 'Buscar em todas as notas…' })).toBeFocused()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+Alt+f')
  await expect(page.locator('.app')).toHaveClass('app focus-mode')
  await page.keyboard.press('Escape')
  await expect(page.locator('.app')).not.toHaveClass(/focus-mode/)
})

test('the status bar can be hidden without losing the save state or mode switch', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.document-statistics')).toBeVisible()
  await page.keyboard.press('Control+,')
  const dialog = page.getByRole('dialog', { name: 'Configurações' })
  await dialog.getByRole('switch', { name: 'Mostrar barra de status' }).uncheck()
  await dialog.getByRole('button', { name: 'Fechar' }).click()
  await expect(page.locator('.document-statistics')).toHaveCount(0)
  await expect(page.locator('.mode-switch')).toBeVisible()
  await page.reload()
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.locator('.document-statistics')).toHaveCount(0)
})
