import { expect, test } from '@playwright/test'

for (const mode of ['visual', 'source']) {
  for (const modifier of ['Control', 'Meta']) {
    test(`${modifier}+B preserves ${mode} editor focus and selection while toggling the library`, async ({
      page,
    }) => {
      await page.goto('/')
      await expect(page.locator('.cm-content')).toBeVisible()
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
      await page.locator('textarea').fill('# Foco\n\ntexto selecionado')
      if (mode === 'visual')
        await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
      const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
      const selectedText = () =>
        editor.evaluate((element) =>
          element.tagName === 'TEXTAREA'
            ? element.value.slice(element.selectionStart, element.selectionEnd)
            : window.getSelection().toString(),
        )
      await editor.click()
      await page.keyboard.press('Control+End')
      await page.keyboard.press('Shift+Home')
      expect(await selectedText()).toBe('texto selecionado')

      for (const visible of [false, true]) {
        await page.keyboard.press(`${modifier}+b`)
        const library = page.locator('.notes-sidebar')
        if (visible) await expect(library).toBeVisible()
        else await expect(library).toBeHidden()
        await expect(editor).toBeFocused()
        expect(await selectedText()).toBe('texto selecionado')
      }
      await page.keyboard.type('continua aqui')
      await expect(editor).toBeFocused()
      if (mode === 'source') await expect(editor).toHaveValue('# Foco\n\ncontinua aqui')
      else await expect(editor).toContainText('continua aqui')
    })
  }
}

test('toggling the library from the menu restores focus to the menu button', async ({ page }) => {
  await page.goto('/')
  const menu = page.getByRole('button', { name: 'Menu principal' })
  await menu.click()
  await page.getByRole('menuitem', { name: /Mostrar\/ocultar biblioteca/ }).click()
  await expect(page.locator('.notes-sidebar')).toBeHidden()
  await expect(menu).toBeFocused()
})
