import { expect, test } from '@playwright/test'
import { openRelease } from './changelog-helpers.js'

for (const width of [390, 1280]) {
  test(`shows the task reorder shortcut next to the caret at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill('# Compras\n\n- [ ] Comprar café\n- [ ] Comprar pão\n\nFim')
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const coffee = page.locator('.cm-line', { hasText: 'Comprar café' })
    const hint = page.locator('.cm-task-move-hint')
    await coffee.click()
    await expect(coffee.locator('.cm-task-move-hint')).toHaveText('Ctrl+Shift+↑/↓')
    await expect(hint).toBeVisible()
    await page.screenshot({ path: `/tmp/sloth-task-move-hint-${width}.png` })
    await page.keyboard.press('Control+Shift+ArrowDown')
    await expect(page.locator('.cm-md-task').first()).toContainText('Comprar pão')
    await page.locator('.cm-line', { hasText: /^Fim$/ }).click()
    await expect(hint).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    const news = page.locator('.visual-editor.read-only')
    await openRelease(page, news, 'Dica de teclado ao editar uma tarefa.', '0.30.3')
    await expect(news).toContainText('quando pode ser movida dentro da lista')
  })
}
