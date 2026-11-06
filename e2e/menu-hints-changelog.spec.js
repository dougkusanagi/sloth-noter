import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function sample(page, text = '# Exemplo\n\nTexto para formatar\n\n') {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}

for (const width of [390, 1280]) {
  test(`app controls share formatting hints at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto('/')
    const controls = [
      [page.locator('.tab-new'), 'Nova nota', ['Ctrl', 'T']],
      [page.locator('.sidebar-toggle'), 'Mostrar/ocultar biblioteca', ['Ctrl', 'Alt', 'B']],
      [page.locator('.menu-trigger'), 'Menu principal', ['F10']],
      [page.locator('.display-trigger'), 'Aparência', []],
      [page.getByRole('radio', { name: 'Código', exact: true }), 'Código', ['Ctrl', 'Alt', '2']],
    ]
    for (const [control, label, keys] of controls) {
      await (label === 'Código' ? control.locator('..') : control).hover()
      await expect(page.getByRole('tooltip')).toContainText(label)
      await control.focus()
      const hint = page.getByRole('tooltip')
      await expect(hint).toHaveCount(1)
      await expect(hint).toContainText(label)
      await expect(hint.locator('kbd')).toHaveText(keys)
      const bounds = await hint.boundingBox()
      expect(bounds.x).toBeGreaterThanOrEqual(8)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8)
      if (
        process.env.CAPTURE_UI &&
        ['Nova nota', 'Menu principal', 'Mostrar/ocultar biblioteca'].includes(label)
      ) {
        await expect(hint).toHaveCSS('opacity', '1')
        const name =
          label === 'Menu principal' ? 'menu' : label === 'Nova nota' ? 'control' : 'sidebar'
        await page.screenshot({ path: `/tmp/sloth-${name}-hint-${width}.png` })
      }
      await page.keyboard.press('Escape')
      await expect(hint).toHaveCount(0)
    }
    await page.locator('.menu-trigger').focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('menuitem', { name: 'Nova nota', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator('.main-menu')).toBeHidden()
  })

  test(`F10 opens and closes the main menu and exposes the library shortcut at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto('/')
    await page.locator('.cm-content').focus()
    await page.keyboard.press('F10')
    const menu = page.getByRole('menu', { name: 'Menu principal', exact: true })
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Nova nota', exact: true })).toBeFocused()
    await expect(
      menu
        .getByRole('menuitem', { name: 'Mostrar/ocultar biblioteca', exact: true })
        .locator('kbd'),
    ).toHaveText(['Ctrl', 'Alt', 'B'])
    await page.keyboard.press('F10')
    await expect(menu).toBeHidden()
    await expect(page.locator('.menu-trigger')).toBeFocused()
    await page.keyboard.press('Control+Alt+f')
    await expect(page.locator('.app')).toHaveClass('app focus-mode')
    await page.keyboard.press('F10')
    await expect(page.locator('.app')).not.toHaveClass(/focus-mode/)
    await expect(menu).toBeVisible()
    await page.keyboard.press('F10')
    await expect(menu).toBeHidden()
    await page.keyboard.press('Control+p')
    const noteSearch = page.locator('.palette-field input')
    await expect(noteSearch).toBeFocused()
    await page.keyboard.press('F10')
    await expect(menu).toBeHidden()
    await expect(noteSearch).toBeFocused()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+Shift+/')
    const list = page.locator('.shortcut-list')
    await expect(
      list.getByRole('listitem').filter({ hasText: 'Menu principal' }).locator('kbd'),
    ).toHaveText(['F10'])
    await expect(
      list.getByRole('listitem').filter({ hasText: 'Mostrar/ocultar biblioteca' }).locator('kbd'),
    ).toHaveText(['Ctrl', 'Alt', 'B'])
  })

  test(`theme choice lives only in the appearance menu and persists at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto('/')
    await expect(page.getByRole('radiogroup', { name: 'Tema', exact: true })).toHaveCount(0)
    const open = () => page.getByRole('button', { name: 'Aparência', exact: true }).click()
    const theme = () => page.getByRole('group', { name: 'Tema', exact: true })
    await open()
    await theme().getByRole('menuitemradio', { name: 'Escuro', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await open()
    await expect(
      theme().getByRole('menuitemradio', { name: 'Escuro', exact: true }),
    ).toHaveAttribute('aria-checked', 'true')
  })

  test(`formatting hints at ${width}px expose real shortcuts on hover and keyboard focus without losing selection`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 })
    await sample(page, '# Exemplo\n\nTexto para formatar')
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Home')
    const bold = page.getByRole('button', { name: 'Negrito', exact: true })
    await bold.hover()
    await expect(page.getByRole('tooltip')).toContainText('CtrlB')
    if (process.env.CAPTURE_UI) {
      await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1')
      await page.screenshot({ path: `/tmp/sloth-toolbar-${width}.png` })
      if (width === 1280)
        await page.screenshot({
          path: '/tmp/sloth-toolbar-detail.png',
          clip: { x: 310, y: 50, width: 430, height: 150 },
        })
    }
    await bold.click()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue('# Exemplo\n\n**Texto para formatar**')
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Home')
    await bold.focus()
    await expect(page.getByRole('tooltip')).toContainText('Negrito')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toHaveCount(0)
  })

  test(`insert menu shows available block shortcuts and keeps keyboard navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 720 })
    await sample(page)
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('/')
    const menu = page.locator('.block-menu')
    await expect(menu.getByRole('button', { name: /Lista/ }).first().locator('kbd')).toHaveCount(3)
    await expect(menu.locator('[title]')).toHaveCount(0)
    await menu.getByRole('button', { name: 'Título 4', exact: true }).hover()
    for (const item of (await menu.getByRole('button').all()).slice(0, 3)) {
      await item.hover()
      const hint = page.getByRole('tooltip')
      await expect(hint).toHaveCount(1)
      await expect(hint).toContainText(await item.getAttribute('aria-label'))
      await expect(hint.locator('kbd')).toHaveText(await item.locator('kbd').allTextContents())
    }
    await expect(page.getByText('Sem atalho definido', { exact: true })).toHaveCount(0)
    if (process.env.CAPTURE_UI) {
      await menu.getByRole('button', { name: 'Citação', exact: true }).hover()
      await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1')
      await page.screenshot({ path: `/tmp/sloth-block-menu-${width}.png` })
    }
    await page.keyboard.press('ArrowDown')
    const first = menu.getByRole('button').first()
    await expect(first).toBeFocused()
    await expect(first).toHaveCSS('box-shadow', /inset/)
    await page.keyboard.press('End')
    await expect(menu.getByRole('button').last()).toBeFocused()
    await expect(menu.getByRole('button').last()).toBeInViewport()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(page.locator('.cm-content')).toBeFocused()
  })
}

for (const width of [390, 1280]) {
  test(`changelog is reachable, readable and offline at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const document = page.locator('.visual-editor.read-only')
    await expect(document).toBeVisible()
    await expect(document).toContainText('Novidades')
    expect(
      (await new AxeBuilder({ page }).include('.visual-editor.read-only').analyze()).violations,
    ).toEqual([])
    expect(await document.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    if (process.env.CAPTURE_UI) await page.screenshot({ path: `/tmp/sloth-changelog-${width}.png` })
    await expect(document).toContainText('Versão 0.4.0')
    await expect(document).toContainText('Colunas, blocos recolhíveis')
    await expect(document).not.toContainText('páginas de memória de 16 KB')
    await expect(page.locator('.cm-content')).toHaveAttribute('aria-readonly', 'true')
    await page.context().setOffline(true)
    const release = document.locator('[data-wiki^="Sloth Note 0.4.0"]')
    await document.hover()
    await expect
      .poll(async () => (await release.count()) || (await page.mouse.wheel(0, 300), 0))
      .toBe(1)
    await release.click()
    await expect(document).toContainText('páginas de memória de 16 KB')
    await document.locator('[data-wiki^="Novidades"]').click()
    await expect(document).toContainText('Versão 0.5.1')
    await page.context().setOffline(false)
    const tabs = page.locator('.tab-wrap')
    const count = await tabs.count()
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Configurações', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Novidades', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tabs).toHaveCount(count)
    await expect(document).toContainText('Novidades')
    await page.getByRole('button', { name: 'Fechar Novidades', exact: true }).click()
    await expect(document).toHaveCount(0)
    await expect(tabs).toHaveCount(count)
  })
}

for (const width of [390, 1920]) {
  test(`insert menu uses the empty left margin when it fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await sample(page, '# Planejamento\n\nTexto que deve continuar visível.\n\n')
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('/')
    const menu = page.locator('.block-menu')
    const bounds = await menu.boundingBox()
    const anchor = await page.locator('.insert-trigger').boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(8)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8)
    if (width === 1920) {
      expect(Math.abs(bounds.x - anchor.x)).toBeLessThan(2)
      expect(bounds.y).toBeGreaterThan(anchor.y)
    }
    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/sloth-insert-position-${width}.png` })
    await menu.getByRole('button', { name: 'Título 2', exact: true }).click()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(/\n## $/)
  })
}

test('command palette highlights the option selected with arrows', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Control+Shift+p')
  const input = page.getByRole('combobox', { name: 'Paleta de comandos' })
  await expect(input).toBeFocused()
  const options = page.locator('#command-results [role=option]')
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(options.nth(1)).toHaveCSS('box-shadow', /inset/)
  await expect(input).toHaveAttribute(
    'aria-activedescendant',
    await options.nth(1).getAttribute('id'),
  )
})

for (const width of [390, 1280]) {
  test(`selection toolbar offers clipboard actions and hides formatting inside code at ${width}px`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.setViewportSize({ width, height: 720 })
    await sample(page, '# Exemplo\n\nTexto comum\n\n```sh\n# **aqui**\n```\n\nfim')
    const toolbar = page.getByRole('toolbar', { name: 'Formatação do texto selecionado' })
    await page.locator('.cm-line', { hasText: 'Texto comum' }).click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Home')
    await expect(toolbar.getByRole('button', { name: 'Copiar', exact: true })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Negrito', exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath(`toolbar-text-${width}.png`) })

    await page.locator('.cm-line', { hasText: '# **aqui**' }).click()
    await page.keyboard.press('End')
    await page.keyboard.press('Shift+Home')
    await expect(toolbar.getByRole('button', { name: 'Recortar', exact: true })).toBeVisible()
    await expect(toolbar.getByRole('button', { name: 'Negrito', exact: true })).toHaveCount(0)
    await page.screenshot({ path: test.info().outputPath(`toolbar-code-${width}.png`) })
    await toolbar.getByRole('button', { name: 'Recortar', exact: true }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('# **aqui**')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(
      '# Exemplo\n\nTexto comum\n\n```sh\n\n```\n\nfim',
    )
  })
}
