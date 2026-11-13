import { test, expect } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`outline toggle, menu layering and palette at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
    const toggle = page.getByRole('button', { name: 'Expandir sumário', exact: true })
    await toggle.hover()
    await expect(page.getByRole('tooltip').locator('kbd')).toHaveText(['Ctrl', 'Alt', 'T'])
    await page.screenshot({ path: `/tmp/sloth-outline-hint-${width}.png` })
    await page.keyboard.press('Control+Alt+t')
    await expect(page.locator('.document-outline')).toHaveClass(/is-open/)
    await page.keyboard.press('Control+Alt+t')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
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
    await release.click()
    await expect(page.locator('.visual-editor.read-only')).toContainText(
      'A lista de comandos inclui alternar o sumário',
    )
    await page.screenshot({ path: `/tmp/sloth-release-0126-${width}.png` })
  })
}
