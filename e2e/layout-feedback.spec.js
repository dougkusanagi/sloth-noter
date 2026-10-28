import { expect, test } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

const parent = 'Texto do pai que ocupa várias linhas '.repeat(12)
const child = 'Filho aninhado'

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  const document = newDocument()
  document.assets = Array.from({ length: 24 }, (_, i) => ({
    src: `assets/image-${i}.png`,
    name: `Imagem ${i}.png`,
  }))
  document.notes[0].body = `# Guias\n\n- [ ] ${parent}\n    - [ ] ${child}\n\nFim`
  await page.addInitScript(
    ({ key, document }) => localStorage.setItem(key, JSON.stringify(document)),
    { key: STORAGE_KEY, document },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

for (const mode of ['Padrão', 'Código', 'Leitura']) {
  test(`width adjustments briefly show accurate boundaries in ${mode}`, async ({ page }) => {
    await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
    await expect(page.locator('.width-feedback')).toHaveCount(0)
    await page.keyboard.press('Control+Alt+-')
    const guide = page.locator('.width-feedback')
    await expect(guide).toBeVisible()
    const target = page.locator(
      mode === 'Padrão' ? '.cm-content' : mode === 'Código' ? 'textarea' : '.cm-content',
    )
    const expected = await target.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        s = getComputedStyle(el)
      return {
        left: r.left + parseFloat(s.paddingLeft),
        width: r.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight),
      }
    })
    const actual = await guide.boundingBox()
    expect(Math.abs(actual.x - expected.left)).toBeLessThan(2)
    expect(Math.abs(actual.width - expected.width)).toBeLessThan(2)
    await expect(guide).toHaveText(`${Math.round(expected.width)} px`)
    if (mode === 'Padrão') await page.screenshot({ path: 'test-results/width-feedback.png' })
    await expect(guide).toBeHidden({ timeout: 3000 })
  })
}

test('nested guides start after the first visual line of a wrapped parent in both modes', async ({
  page,
}) => {
  await page.locator('.cm-content').press('Control+End')
  const rail = page.locator('.cm-rail')
  await expect(rail).toBeVisible()
  const parentLine = page.locator('.cm-md-task').first()
  const rect = await parentLine.boundingBox()
  const guide = await rail.boundingBox()
  const lineHeight = await parentLine.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight))
  expect(Math.abs(guide.y - (rect.y + lineHeight))).toBeLessThan(2)
  expect(guide.y).toBeLessThan(rect.y + rect.height - lineHeight)
  await page.screenshot({ path: 'test-results/parent-list-guide.png' })
  await page.getByRole('radio', { name: 'Leitura', exact: true }).check({ force: true })
  await expect(page.locator('.visual-editor.read-only')).toBeVisible()
  expect(await rail.boundingBox()).toEqual(guide)
})

test('image menu covers the scrollbar outside the library scroll container', async ({ page }) => {
  await page.keyboard.press('Control+Shift+l')
  await page
    .locator('.image-item')
    .nth(1)
    .click({ button: 'right', position: { x: 105, y: 25 } })
  const menu = page.locator('body > .image-context-menu')
  await expect(menu).toBeVisible()
  const scroll = await page.locator('.sidebar-items').boundingBox()
  expect(
    await page.locator('.sidebar-items').evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true)
  await page.screenshot({ path: 'test-results/image-menu-overlay.png' })
  await expect
    .poll(() =>
      menu.evaluate(
        (el, x) => el.contains(document.elementFromPoint(x, el.getBoundingClientRect().top + 20)),
        scroll.x + scroll.width - 2,
      ),
    )
    .toBe(true)
  await page.screenshot({ path: 'test-results/image-menu-overlay.png' })
})
