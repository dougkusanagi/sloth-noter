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
    await page.mouse.move(100, 200)
    await expect(page.getByRole('button', { name: 'Sair do modo foco', exact: true })).toHaveCSS(
      'opacity',
      '0',
    )
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
  await page.keyboard.press('Control+Alt+f')
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
  await page.locator('.focus-exit-region').hover()
  await expect(page.getByRole('button', { name: 'Sair do modo foco', exact: true })).toHaveCSS(
    'opacity',
    '1',
  )
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
  await page.getByRole('button', { name: 'Sair do modo foco', exact: true }).focus()
  await expect(page.getByRole('button', { name: 'Sair do modo foco', exact: true })).toHaveCSS(
    'opacity',
    '1',
  )
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(violations).toEqual([])
  await page.keyboard.press('Control+Shift+p')
  await page.getByRole('combobox').fill('Modo foco')
  await page.keyboard.press('Enter')
  await expect(page.locator('.app')).toHaveClass('app')
})

test('the exit control disappears when writing and appears only on corner hover or keyboard focus', async ({
  page,
}) => {
  await page.keyboard.press('Control+Alt+f')
  const button = page.getByRole('button', { name: 'Sair do modo foco', exact: true })
  await page.mouse.move(100, 200)
  await expect(button).toHaveCSS('opacity', '0')
  await page.locator('.focus-exit-region').hover()
  await expect(button).toHaveCSS('opacity', '1')
  await page.mouse.move(100, 200)
  await expect(button).toHaveCSS('opacity', '0')
  await button.focus()
  await expect(button).toHaveCSS('opacity', '1')
  await page.locator('.cm-content').focus()
  await expect(button).toHaveCSS('opacity', '0')
  await page.keyboard.press('Escape')
  await expect(page.locator('.app')).toHaveClass('app')
})

test('touch reveals the exit without leaving focus until the button is tapped', async ({
  page,
  browser,
}) => {
  const context = await browser.newContext({
    storageState: await page.context().storageState(),
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  })
  try {
    const touch = await context.newPage()
    await touch.goto('/')
    await expect(touch.locator('.cm-content')).toBeVisible()
    await touch.keyboard.press('Control+Alt+f')
    const button = touch.getByRole('button', { name: 'Sair do modo foco', exact: true })
    await expect(button).toHaveCSS('opacity', '0')
    await touch.locator('.focus-exit-region').tap({ position: { x: 10, y: 8 } })
    await expect(button).toHaveCSS('opacity', '1')
    await expect(touch.locator('.app')).toHaveClass('app focus-mode')
    await button.tap()
    await expect(touch.locator('.app')).toHaveClass('app')
  } finally {
    await context.close()
  }
})
