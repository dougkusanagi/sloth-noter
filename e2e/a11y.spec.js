import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

async function violations(page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target).join(' | ')}`)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

for (const theme of ['light', 'dark']) {
  test(`the editor has no detectable violations (${theme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme })
    expect(await violations(page)).toEqual([])
  })
}

test('the main menu has no detectable violations', async ({ page }) => {
  await page.getByRole('button', { name: 'Menu principal' }).click()
  await expect(page.getByRole('menu', { name: 'Menu principal' })).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('the find dialog has no detectable violations', async ({ page }) => {
  await page.keyboard.press('Control+f')
  await expect(page.getByRole('dialog', { name: 'Buscar na nota' })).toBeVisible()
  expect(await violations(page)).toEqual([])
})

test('reading mode has no detectable violations', async ({ page }) => {
  await page.getByRole('radio', { name: /Leitura/ }).check({ force: true })
  await expect(page.locator('.reading')).toBeVisible()
  expect(await violations(page)).toEqual([])
})
