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
      [page.locator('.display-trigger'), 'Aparência do texto', []],
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

  test(`theme choice stays visible and persists at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 720 })
    await page.goto('/')
    const themes = page.getByRole('radiogroup', { name: 'Tema', exact: true })
    await expect(themes).toBeInViewport()
    await themes.getByRole('radio', { name: 'Escuro', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(themes.getByRole('radio', { name: 'Escuro', exact: true })).toBeChecked()
    await themes.getByRole('radio', { name: 'Escuro', exact: true }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(themes.getByRole('radio', { name: 'Sistema', exact: true })).toBeFocused()
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
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
    await page.getByRole('button', { name: 'Inserir bloco', exact: true }).click()
    const menu = page.locator('.block-menu')
    await expect(menu.getByRole('menuitem', { name: /Lista/ }).first().locator('kbd')).toHaveCount(
      3,
    )
    await expect(menu.locator('[title]')).toHaveCount(0)
    await menu.getByRole('menuitem', { name: 'Título 4', exact: true }).hover()
    for (const item of await menu.getByRole('menuitem').all()) {
      await item.hover()
      const hint = page.getByRole('tooltip')
      await expect(hint).toHaveCount(1)
      await expect(hint).toContainText(await item.getAttribute('aria-label'))
      await expect(hint.locator('kbd')).toHaveText(await item.locator('kbd').allTextContents())
    }
    await expect(page.getByText('Sem atalho definido', { exact: true })).toHaveCount(0)
    if (process.env.CAPTURE_UI) {
      await menu.getByRole('menuitem', { name: 'Citação', exact: true }).hover()
      await expect(page.getByRole('tooltip')).toHaveCSS('opacity', '1')
      await page.screenshot({ path: `/tmp/sloth-block-menu-${width}.png` })
    }
    await page.keyboard.press('End')
    await expect(menu.getByRole('menuitem').last()).toBeFocused()
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
    await page.context().setOffline(true)
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const source = page.locator('textarea')
    await expect(source).toHaveValue(/^# Novidades\n/)
    const original = await source.inputValue()
    expect(original).toContain('F10 abre ou fecha o menu principal')
    expect(original).toContain('Baixar atualização')
    expect(original).toContain('modo Leitura agora mostra a nota')
    await source.fill(original + '\nMinha anotação pessoal.\n')
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    await expect(document).not.toContainText('Minha anotação pessoal.')
    const tabs = page.locator('.tab-wrap')
    const count = await tabs.count()
    await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
    await page.getByRole('menuitem', { name: 'Configurações', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Novidades', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(tabs).toHaveCount(count)
    await expect(document).toContainText('Novidades')
  })
}

for (const width of [390, 1920]) {
  test(`insert menu uses the empty left margin when it fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await sample(page, '# Planejamento\n\nTexto que deve continuar visível.\n\n')
    await page.locator('.cm-content').click()
    await page.keyboard.press('Control+End')
    const trigger = page.getByRole('button', { name: 'Inserir bloco', exact: true })
    await trigger.click()
    const menu = page.locator('.block-menu')
    const bounds = await menu.boundingBox()
    const anchor = await trigger.boundingBox()
    expect(bounds.x).toBeGreaterThanOrEqual(8)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 8)
    if (width === 1920) {
      expect(bounds.x + bounds.width).toBeLessThan(anchor.x)
      const content = await page.locator('.cm-content').boundingBox()
      expect(bounds.x + bounds.width).toBeLessThan(content.x)
    }
    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/sloth-insert-position-${width}.png` })
    await menu.getByRole('menuitem', { name: 'Título 2', exact: true }).click()
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await expect(page.locator('textarea')).toHaveValue(/\n## $/)
  })
}
