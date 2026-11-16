import { expect, test } from '@playwright/test'

const body = '# Projeto\n\n- [ ] Escrever\n- [ ] Revisar\n\nFim'
const mode = (page, name) => page.getByRole('radio', { name, exact: true }).check({ force: true })
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((body) => {
    localStorage.setItem(
      'sloth-note:v3',
      JSON.stringify({
        version: 3,
        notes: [{ id: 'a', name: 'Projeto.md', body, revision: 0 }],
        trash: [],
        openIds: ['a'],
        activeId: 'a',
        preferences: { tabsVisible: true, language: 'pt-BR', theme: 'dark', fontSize: 16 },
      }),
    )
  }, body)
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('Alt+2…5 mudam o status da linha e a data acompanha concluir e reabrir', async ({ page }) => {
  await page.locator('.cm-line', { hasText: 'Escrever' }).click()
  await page.keyboard.press('Alt+2')
  await expect(page.locator('.cm-line', { hasText: 'Escrever' })).toContainText('[/]')
  await page.keyboard.press('Alt+3')
  await expect(page.locator('.cm-line', { hasText: 'Escrever' })).toContainText('[>]')
  await page.keyboard.press('Alt+4')
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(
    `# Projeto\n\n- [x] Escrever ✅ ${today()}\n- [ ] Revisar\n\nFim`,
  )
  await mode(page, 'Padrão')
  await page.locator('.cm-line', { hasText: 'Escrever' }).click()
  await page.keyboard.press('Alt+5')
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(
    `# Projeto\n\n- [-] Escrever ❌ ${today()}\n- [ ] Revisar\n\nFim`,
  )
  await mode(page, 'Padrão')
  await page.locator('.cm-line', { hasText: 'Escrever' }).click()
  await page.keyboard.press('Alt+1')
  await mode(page, 'Código')
  await expect(page.locator('textarea')).toHaveValue(/- \[ \] Escrever\n- \[ \] Revisar/)
})
