import { expect, test } from '@playwright/test'

test('the mobile library opens bundled guides without note actions', async ({ page }) => {
  await page.goto('/?platform=mobile')
  const folder = page.locator('.guide-folder').first()
  await folder.locator('summary').first().click()
  await page.getByRole('button', { name: 'Bem-vindo', exact: true }).click()
  const guide = page.locator('.markdown')
  await expect(guide.getByRole('heading', { name: 'Bem-vindo' })).toBeVisible()
  await expect(guide.getByRole('img', { name: 'Uma preguiça escreve num caderno' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Editar', exact: true })).toHaveCount(0)
  await page.screenshot({ path: '/tmp/sloth-docs-mobile.png' })
  await page.goBack()
  await expect(page.locator('[data-note-id="welcome"]')).toContainText('Rascunho')
})
