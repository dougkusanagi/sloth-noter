import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'
for (const theme of ['dark', 'light']) {
  test(`shots2 ${theme}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.emulateMedia({ colorScheme: theme })
    const document = newDocument()
    document.assets = Array.from({ length: 5 }, (_, i) => ({
      src: `assets/image-${i}.png`,
      name: `clipboard ${i}.png`,
    }))
    for (const [i, name] of ['Ideias', 'Contas', 'SSH VPS'].entries())
      document.notes.push({
        id: `n${i}`,
        name: `${name}.md`,
        body: `# ${name}\n\nTexto de ${name}`,
        revision: 0,
      })
    await page.addInitScript(
      ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
      { key: STORAGE_KEY, document },
    )
    await page.goto('/')
    await expect(page.locator('.cm-content')).toBeVisible()
    const sidebar = page.getByRole('complementary', { name: 'Biblioteca' })
    for (const name of ['Ideias', 'Contas']) {
      await sidebar.getByRole('button', { name, exact: true }).click({ button: 'right' })
      await page.getByRole('menuitem', { name: 'Mover para a lixeira' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Mover', exact: true }).click()
    }
    await sidebar.getByRole('button', { name: /^Lixeira/ }).click()
    await page.locator('.trash-library-item').first().hover()
    await page.waitForTimeout(300)
    await page.screenshot({
      path: `/tmp/shots/${theme}-trash.png`,
      clip: { x: 0, y: 0, width: 640, height: 420 },
    })
    await sidebar.getByRole('button', { name: 'Esvaziar', exact: true }).click()
    await page.waitForTimeout(350)
    await page.screenshot({ path: `/tmp/shots/${theme}-confirm.png` })
    await page.keyboard.press('Escape')
    await sidebar.getByRole('button', { name: 'Voltar para a biblioteca' }).click()
    await sidebar.getByRole('button', { name: /^Imagens/ }).click()
    await page.locator('.image-item').first().hover()
    await page.waitForTimeout(300)
    await page.screenshot({
      path: `/tmp/shots/${theme}-images.png`,
      clip: { x: 0, y: 0, width: 640, height: 620 },
    })
    await page.keyboard.press('Control+Shift+p')
    await page.waitForTimeout(350)
    await page.screenshot({ path: `/tmp/shots/${theme}-palette.png` })
  })
}
