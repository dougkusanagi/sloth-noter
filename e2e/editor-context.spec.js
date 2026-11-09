import { expect, test } from '@playwright/test'

async function source(page, body) {
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill(body)
}
async function visual(page) {
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
}

test('combined emphasis marks both toolbar buttons', async ({ page }) => {
  await page.goto('/')
  await source(page, '# Formatos\n\n***Teste***')
  await visual(page)
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Shift+Home')
  const toolbar = page.getByRole('toolbar')
  await expect(toolbar.getByRole('button', { name: 'Negrito', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(toolbar.getByRole('button', { name: 'Itálico', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('sidebar button explains its shortcut and the shortcut toggles the sidebar', async ({
  page,
}) => {
  await page.goto('/')
  const button = page.locator('.sidebar-toggle')
  await button.hover()
  await expect(page.getByRole('tooltip')).toContainText('Ctrl')
  await expect(page.getByRole('tooltip')).toContainText('B')
  await expect(page.getByRole('tooltip')).toContainText('Alt')
  await page.keyboard.press('Control+Alt+b')
  await expect(page.locator('.notes-sidebar')).toHaveCount(0)
  await page.keyboard.press('Control+Alt+b')
  await expect(page.locator('.notes-sidebar')).toBeVisible()
})

for (const mode of ['source', 'reading']) {
  test(`tabs remember independent scroll in ${mode}`, async ({ page }) => {
    await page.goto('/')
    await source(
      page,
      '# Longa\n\n' + Array.from({ length: 100 }, (_, i) => `Parágrafo ${i}\n`).join('\n'),
    )
    if (mode === 'visual') await visual(page)
    if (mode === 'reading')
      await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    const scroll = () =>
      page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller, textarea')
        return Math.max(window.scrollY, scroller?.scrollTop ?? 0)
      })
    await page.evaluate(() => {
      window.scrollTo(0, 800)
      document.querySelector('.cm-scroller, textarea')?.scrollTo(0, 800)
    })
    await expect.poll(scroll).toBeGreaterThan(500)
    const previous = await scroll()
    await page.keyboard.press('Control+t')
    await expect.poll(scroll).toBe(0)
    await page.keyboard.press('Control+PageUp')
    if (mode === 'reading')
      await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
    await expect.poll(scroll).toBeGreaterThan(previous - 48)
  })
}

test('insert menu fits left of text when the margin allows it', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto('/')
  await source(page, '# Menu\n\nTexto\n\n')
  await visual(page)
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('/')
  const menu = await page.locator('.block-menu').boundingBox()
  const trigger = await page.locator('.insert-trigger').boundingBox()
  expect(Math.abs(menu.x - trigger.x)).toBeLessThan(2)
  await page.screenshot({ path: '/tmp/sloth-editor-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.keyboard.press('Control+Alt+b')
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.type('/')
  const mobileMenu = await page.locator('.block-menu').boundingBox()
  expect(mobileMenu.x).toBeGreaterThanOrEqual(8)
  expect(mobileMenu.x + mobileMenu.width).toBeLessThanOrEqual(382)
  await page.screenshot({ path: '/tmp/sloth-editor-mobile.png' })
})
