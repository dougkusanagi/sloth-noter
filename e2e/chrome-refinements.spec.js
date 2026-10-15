import { expect, test } from '@playwright/test'

test('main menu adjusts and restores text without closing', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.locator('.save-status')).toBeHidden()
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  const group = page.getByRole('group', { name: 'Tamanho do texto', exact: true })
  await group.getByRole('menuitem', { name: /Aumentar/ }).click()
  await expect(group.locator('output')).toHaveText('17px')
  await group.getByRole('menuitem', { name: /Restaurar/ }).click()
  await expect(group.locator('output')).toHaveText('16px')
  const width = page.getByRole('group', { name: 'Largura do texto', exact: true })
  await width.getByRole('menuitem', { name: /Diminuir/ }).click()
  await expect(width.locator('output')).toHaveText('740px')
  await width.getByRole('menuitem', { name: /Restaurar/ }).click()
  await expect(width.locator('output')).toHaveText('760px')
  await page.locator('.menu-adjustments').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/text-layout-menu.png' })
})

test('wrapped tasks reserve the checkbox column and context menus cover the sidebar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 980, height: 780 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .getByRole('textbox', { name: 'Editor Markdown em texto puro' })
    .fill(`# Teste\n\n- [ ] ${'texto longo '.repeat(45)}\n\nParágrafo`)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').press('Control+Home')
  const task = page.locator('.cm-md-task')
  await expect(task).toBeVisible()
  expect(await task.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft))).toBe(25)
  expect(
    await task.locator('input').evaluate((el) => parseFloat(getComputedStyle(el).marginLeft)),
  ).toBe(-25)
  await page.locator('.tab').first().click({ button: 'right' })
  await expect(page.locator('body > .tab-context-menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.document-info')).toContainText('palavras')
  await page.screenshot({ path: 'test-results/chrome-refinements.png' })
})

test('sidebar layout updates rails and insert control, and short notes do not scroll', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .getByRole('textbox', { name: 'Editor Markdown em texto puro' })
    .fill(`# Layout\n\n- pai\n    - ${'filho longo '.repeat(18)}\n    - último filho\n\n`)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.cm-content').press('Control+End')
  const bounds = (selector) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => el.getBoundingClientRect().toJSON())
  const before = await bounds('.cm-rail')
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
  await page.locator('.cm-content').press('Control+End')
  await expect.poll(async () => (await bounds('.cm-rail')).left).not.toBe(before.left)
  const parent = await page
    .locator('.cm-line')
    .filter({ hasText: /^pai$/ })
    .evaluate((el) => el.getBoundingClientRect().toJSON())
  await expect.poll(async () => (await bounds('.cm-rail')).left - parent.left).toBeGreaterThan(0)
  const rail = await bounds('.cm-rail')
  expect(rail.left - parent.left).toBeLessThan(24)
  const last = await page
    .locator('.cm-line')
    .filter({ hasText: 'último filho' })
    .evaluate((el) => el.getBoundingClientRect().toJSON())
  expect(Math.abs(rail.bottom - last.bottom)).toBeLessThan(2)
  await expect(page.locator('.insert-trigger')).toBeVisible()
  const trigger = await bounds('.insert-trigger')
  expect(Math.abs(trigger.left - (parent.left - 34))).toBeLessThan(2)
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true)
  const mode = await bounds('.mode-switch')
  const status = await bounds('.document-info')
  expect(status.top - mode.bottom).toBeGreaterThanOrEqual(12)
  expect(Math.abs(mode.right - (1400 - 16))).toBeLessThan(2)
  await page.screenshot({ path: 'test-results/layout-refinements.png' })
})

test('short notes fit the viewport in every mode on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page
    .getByRole('textbox', { name: 'Editor Markdown em texto puro' })
    .fill('# Curta\n\nTexto')
  for (const name of ['Código', 'Padrão', 'Leitura']) {
    await page.getByRole('radio', { name, exact: true }).check({ force: true })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight))
      .toBeLessThanOrEqual(0)
  }
})

test('display controls expose working shortcuts and persistent system/light/dark themes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
  await expect(page.locator('.app-header .save-status')).toHaveCount(0)
  await expect(page.locator('.document-info .save-status')).toHaveCount(1)
  await expect(page.locator('.mode-switch')).toHaveCSS('box-shadow', 'none')
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  const theme = page.getByRole('group', { name: 'Tema', exact: true })
  await theme.getByRole('menuitemradio', { name: 'Claro', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  expect(
    await page.locator('.main-menu').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe('rgb(255, 255, 255)')
  await theme.getByRole('menuitemradio', { name: 'Escuro', exact: true }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await theme.getByRole('menuitemradio', { name: 'Sistema', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  for (const label of ['Tamanho do texto', 'Largura do texto']) {
    const group = page.getByRole('group', { name: label, exact: true })
    await expect(group.locator('.menu-shortcut')).toHaveCount(3)
    for (const button of await group.getByRole('menuitem').all()) {
      expect(await button.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    }
  }
  await page.getByRole('group', { name: 'Largura do texto', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/display-menu-mobile.png' })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+-')
  await expect(page.locator('.app')).toHaveCSS('--editor-size', '15px')
  await page.keyboard.press('Control+0')
  await expect(page.locator('.app')).toHaveCSS('--editor-size', '16px')
  await page.keyboard.press('Control+Shift+=')
  await expect(page.locator('.app')).toHaveCSS('--editor-size', '17px')
  await page.keyboard.press('Control+Alt+-')
  await expect(page.locator('.app')).toHaveCSS('--content-width', '740px')
  await page.keyboard.press('Control+Alt+0')
  await expect(page.locator('.app')).toHaveCSS('--content-width', '760px')
  await page.keyboard.press('Control+Alt+Shift+=')
  await expect(page.locator('.app')).toHaveCSS('--content-width', '780px')
  await expect(page.locator('.app')).toHaveCSS('--editor-size', '17px')
  await page.reload()
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await expect(page.getByRole('menuitemradio', { name: 'Sistema', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})
