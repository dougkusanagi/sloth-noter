import { expect, test } from '@playwright/test'
import { STORAGE_KEY } from '../src/storage.js'

for (const mode of ['visual', 'source']) {
  test(`Tab and Shift+Tab switch between the title and body in ${mode} mode`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill('# Título\n## Conteúdo começa aqui')
    await expect(page.locator('textarea')).toHaveValue('# Título\n## Conteúdo começa aqui')
    if (mode === 'visual')
      await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Tab')
    await expect(editor).toBeFocused()
    await page.keyboard.press('End')
    await page.keyboard.type(' editado')
    await page.keyboard.press('Shift+Tab')
    await expect(editor).toBeFocused()
    await page.keyboard.type(' renomeado')
    if (mode === 'visual')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const expected = '# Título renomeado\n## Conteúdo começa aqui editado'
    await expect(page.locator('textarea')).toHaveValue(expected)
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const document = JSON.parse(localStorage.getItem(key))
          return document.notes.find((note) => note.id === document.activeId).body
        }, STORAGE_KEY),
      )
      .toBe(expected)
    await page.reload()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(expected)
  })

  test(`Tab from an empty ${mode} title creates no tab characters and starts the body on the next line`, async ({
    page,
  }) => {
    await page.goto('/')
    await page.keyboard.press('Control+t')
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Shift+End')
    await page.keyboard.type('Título')
    await page.keyboard.press('Tab')
    await page.keyboard.type('## Conteúdo começa aqui')
    if (mode === 'visual')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue('# Título\n## Conteúdo começa aqui')
  })
}

for (const mode of ['visual', 'source']) {
  test(`a blank line below the title is optional in ${mode} mode`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill('# Título\nCorpo')
    if (mode === 'visual')
      await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.keyboard.press('Control+Home')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const document = JSON.parse(localStorage.getItem(key))
          return document.notes.find((note) => note.id === document.activeId).body
        }, STORAGE_KEY),
      )
      .toBe('# Título\n\nCorpo')
    await page.keyboard.press('Backspace')
    if (mode === 'visual')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue('# Título\nCorpo')
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const document = JSON.parse(localStorage.getItem(key))
          return document.notes.find((note) => note.id === document.activeId).body
        }, STORAGE_KEY),
      )
      .toBe('# Título\nCorpo')
    await page.reload()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue('# Título\nCorpo')
  })
}
