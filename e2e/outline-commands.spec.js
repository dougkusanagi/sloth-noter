import { test, expect } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`outline toggle, menu layering and palette at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    if (width > 600)
      await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
    const toggle = page.getByRole('button', { name: 'Expandir sumário', exact: true })
    await toggle.hover()
    await expect(page.getByRole('tooltip').locator('kbd')).toHaveText(['Ctrl', 'Alt', 'T'])
    await page.screenshot({ path: `/tmp/sloth-outline-hint-${width}.png` })
    await page.keyboard.press('Control+Alt+t')
    await expect(page.locator('.document-outline')).toHaveClass(/is-open/)
    await page.keyboard.press('Control+Alt+t')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.focus()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('tooltip')).toBeHidden()
    await page.locator('.menu-trigger').click()
    await page.screenshot({ path: `/tmp/sloth-menu-fixed-${width}.png` })
    const menu = page.locator('.main-menu')
    await expect(menu).toBeVisible()
    const covered = await page.locator('.document-outline').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return document.elementFromPoint(r.x + 8, r.y + 8)?.closest('.main-menu') !== null
    })
    expect(covered).toBe(true)
    await page.keyboard.press('Escape')
    await page.keyboard.press('Control+Shift+p')
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').fill('Sumário')
    await dialog.getByRole('option', { name: /Sumário/ }).click()
    await expect(page.locator('.document-outline')).toHaveClass(/is-open/)
    await page.locator('.menu-trigger').click()
    await page.getByRole('menuitem', { name: 'Novidades', exact: true }).click()
    const sidebar = page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true })
    if ((await sidebar.getAttribute('aria-expanded')) === 'true') await sidebar.click()
    const release = page.locator('[data-wiki^="Sloth Note 0.12.6"]')
    await page.locator('.visual-editor.read-only').hover()
    // The version index is long: scroll until the entry is drawn.
    await expect
      .poll(
        async () => {
          if (await release.count()) return true
          await page.mouse.wheel(0, 600)
          return false
        },
        { intervals: [100], timeout: 15000 },
      )
      .toBe(true)
    await release.click()
    await expect(page.locator('.visual-editor.read-only')).toContainText(
      'A lista de comandos inclui alternar o sumário',
    )
    await page.screenshot({ path: `/tmp/sloth-release-0126-${width}.png` })
  })
}

// The outline sticks below the header, so it stays in view while a long note scrolls.
for (const width of [390, 1280]) {
  test(`the outline stays in view while the note scrolls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page.locator('textarea').fill('# Nota longa\n\n' + '## Seção\n\nParágrafo\n\n'.repeat(45))
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const toggle = page.getByRole('button', { name: 'Expandir sumário', exact: true })
    const before = await toggle.boundingBox()
    await page.mouse.move(width / 2, 400)
    await page.mouse.wheel(0, 3000)
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(1000)
    await expect(toggle).toBeInViewport()
    const header = await page.locator('.app-header').boundingBox()
    const after = await toggle.boundingBox()
    expect(after.y).toBeGreaterThanOrEqual(header.y + header.height)
    expect(Math.abs(after.x - before.x)).toBeLessThan(1)
  })
}

for (const width of [390, 600, 601, 1280]) {
  test(`the library and outline do not overlap at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    await page
      .locator('textarea')
      .fill(
        '# Leituras\nNotas da semana\n\n## Artigos\n\n- [ ] Separar artigos\n- [x] Ler capítulo 2',
      )
    await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
    const libraryButton = page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' })
    const library = page.getByRole('complementary', { name: 'Biblioteca' })
    const outline = page.getByRole('button', { name: 'Expandir sumário' })
    if ((await libraryButton.getAttribute('aria-expanded')) === 'false') await libraryButton.click()
    await expect(library).toBeVisible()
    if (process.env.SLOTH_OUTLINE_CAPTURE)
      await page.screenshot({
        path: `/tmp/sloth-outline-${process.env.SLOTH_OUTLINE_CAPTURE}-${width}.png`,
      })
    if (width <= 600) {
      await expect(outline).toBeHidden()
    } else {
      const sidebar = await library.boundingBox()
      const button = await outline.boundingBox()
      expect(button.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width)
    }
    await libraryButton.click()
    await expect(outline).toBeVisible()
    await outline.click()
    await expect(page.getByRole('button', { name: 'Recolher sumário' })).toBeVisible()
  })
}
