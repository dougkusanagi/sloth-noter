import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

test.beforeEach(async ({ page }) => {
  const document = {
    ...newDocument(),
    notes: ['Escrita', 'Ideias'].map((id) => ({
      id,
      name: `${id}.md`,
      body: `# ${id}\n\nUm parágrafo para escrever com tranquilidade.\n\nOutro parágrafo.`,
      revision: 1,
    })),
    openIds: ['Escrita', 'Ideias'],
    activeId: 'Escrita',
    preferences: { ...newDocument().preferences, sidebarVisible: true },
  }
  await page.addInitScript(
    ({ key, document }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(document))
    },
    { key: STORAGE_KEY, document },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

for (const mode of ['Padrão', 'Código', 'Leitura']) {
  test(`the appearance toggle enters focus and restores the interface in ${mode}`, async ({
    page,
  }) => {
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await page.getByRole('button', { name: 'Aparência do texto', exact: true }).click()
    const toggle = page.getByRole('menuitemcheckbox', { name: /Modo foco/ })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(page.locator('.app')).toHaveClass('app focus-mode')
    await expect(page.locator('.app-header')).toBeHidden()
    await expect(page.locator('.document-info')).toBeHidden()
    await expect(page.locator('.notes-sidebar')).toHaveCount(0)
    await expect(
      page.getByRole('radio', { name: mode, exact: true, includeHidden: true }),
    ).toBeChecked()
    await expect(page.getByRole('button', { name: 'Sair do modo foco', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.app')).toHaveClass('app')
    await expect(page.locator('.app-header')).toBeVisible()
    await expect(page.locator('.document-info')).toBeVisible()
    await expect(page.locator('.notes-sidebar')).toBeVisible()
  })
}

test('focus preserves the writing selection and supports tab navigation, find and nested Escape', async ({
  page,
}) => {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  const editor = page.locator('textarea')
  await editor.focus()
  await editor.press('Control+End')
  await editor.press('Home')
  await editor.press('Shift+End')
  const selected = await editor.evaluate((el) => [el.selectionStart, el.selectionEnd])
  await page.keyboard.press('Control+Shift+f')
  await expect(editor).toBeFocused()
  expect(await editor.evaluate((el) => [el.selectionStart, el.selectionEnd])).toEqual(selected)
  await page.keyboard.press('Control+p')
  await expect(page.getByRole('dialog', { name: 'Buscar nota', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.app')).toHaveClass('app focus-mode')
  await page.keyboard.press('Control+2')
  await expect(editor).toHaveValue(/# Ideias/)
  await page.keyboard.press('Control+f')
  await expect(page.getByRole('dialog', { name: 'Buscar na nota', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.app')).toHaveClass('app focus-mode')
  await page.getByRole('button', { name: 'Sair do modo foco', exact: true }).click()
  await expect(page.locator('.app')).toHaveClass('app')
})

test('focus is discoverable in the main menu and command palette and remains accessible on mobile', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: /Modo foco/ }).click()
  await expect(page.locator('.app')).toHaveClass('app focus-mode')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('button', { name: 'Sair do modo foco', exact: true }),
  ).toBeInViewport()
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(violations).toEqual([])
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox').fill('Modo foco')
  await page.keyboard.press('Enter')
  await expect(page.locator('.app')).toHaveClass('app')
})
