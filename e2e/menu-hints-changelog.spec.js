import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function sample(page, text = '# Exemplo\n\nTexto para formatar\n\n') {
  await page.goto('/')
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(text)
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}

for (const width of [390, 1280]) {
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
    await expect(page.getByText('Sem atalho definido', { exact: true })).toHaveCount(0)
    if (process.env.CAPTURE_UI)
      await page.screenshot({ path: `/tmp/sloth-block-menu-${width}.png` })
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
    const dialog = page.getByRole('dialog', { name: 'Configurações', exact: true })
    await expect(dialog.getByRole('heading', { name: 'Novidades', exact: true })).toBeVisible()
    await expect(dialog.locator('.changelog-page')).toContainText('barra flutuante')
    if (process.env.CAPTURE_UI) await page.screenshot({ path: `/tmp/sloth-changelog-${width}.png` })
    const illustration = dialog.getByAltText(
      'Barra de formatação com texto selecionado e dica Negrito mostrando Ctrl e B, com o cursor sobre o botão.',
    )
    await expect(illustration).toHaveCount(1)
    await expect
      .poll(() => illustration.evaluate((img) => img.complete && img.naturalWidth > 0))
      .toBe(true)
    if (process.env.CAPTURE_UI)
      await illustration.screenshot({ path: `/tmp/sloth-hover-illustration-${width}.png` })
    expect(
      (await new AxeBuilder({ page }).include('.settings-dialog').analyze()).violations,
    ).toEqual([])
    await page.context().setOffline(true)
    await dialog.locator('summary').click()
    await expect(dialog.locator('details[open]')).toContainText('0.1.0')
    expect(
      await dialog.locator('.settings-panel').evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
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
