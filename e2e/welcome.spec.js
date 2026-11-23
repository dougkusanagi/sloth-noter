import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const docs = (page) => page.locator('.visual-editor.read-only .cm-content')

for (const width of [390, 1280]) {
  test(`the application guides are read-only and hide under Docs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Rascunho.md', exact: true })).toBeVisible()
    if (width === 390) await page.locator('.sidebar-toggle').click()
    const folder = page.locator('.guide-folder').first()
    await folder.locator('summary').first().click()
    await page.getByRole('button', { name: 'Bem-vindo', exact: true }).click()
    if (width === 390) await page.locator('.sidebar-toggle').click()
    await expect(docs(page).locator('.cm-md-h1')).toHaveText('Bem-vindo')
    await expect(docs(page)).toHaveAttribute('aria-readonly', 'true')
    await expect
      .poll(() =>
        docs(page)
          .locator('.cm-image-preview')
          .first()
          .evaluate((img) => img.naturalWidth),
      )
      .toBeGreaterThan(0)
    await page.screenshot({ path: `/tmp/sloth-docs-${width}.png` })

    if (width === 390) {
      await page.locator('.sidebar-toggle').click()
      await folder.locator('summary').first().click()
    }
    await folder.getByText('Exemplos', { exact: true }).click()
    await page.getByRole('button', { name: 'Markdown na prática' }).click()
    await expect(docs(page).locator('.cm-md-h1')).toHaveText('Markdown na prática')
    await expect(docs(page).locator('.cm-md-inline-strike')).toHaveText('riscado')
    await page.getByRole('button', { name: 'Listas, tarefas e ligações' }).click()
    await expect(docs(page).getByRole('checkbox').first()).toBeDisabled()
    await folder.locator('summary').first().click()
    await expect(page.getByRole('button', { name: 'Markdown na prática' })).toBeHidden()
    if (width === 390) await page.locator('.sidebar-toggle').click()
    await page.getByRole('button', { name: 'Fechar documentação' }).click()
    await expect(docs(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    await expect(docs(page)).toContainText('A biblioteca ganhou uma pasta de documentação.')
    await docs(page).locator('[data-wiki^="Sloth Note 0.32.0"]').click()
    const image = docs(page).getByRole('img', {
      name: 'Pasta Docs com Bem-vindo e a subpasta Exemplos na biblioteca',
    })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((element) => element.naturalWidth)).toBeGreaterThan(0)
  })
}

test('opening Documentation from the menu preserves a legacy note', async ({ page }) => {
  const document = newDocument()
  document.notes[0] = {
    ...document.notes[0],
    name: 'Welcome.md',
    body: '# Welcome\n\nMinhas anotações',
  }
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    {
      key: STORAGE_KEY,
      document,
    },
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Documentação', exact: true }).click()
  await expect(docs(page).locator('.cm-md-h1')).toHaveText('Bem-vindo')
  await page.keyboard.press('Shift+Delete')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Fechar documentação' }).click()
  await expect(page.locator('.cm-content')).toContainText('Minhas anotações')
})
