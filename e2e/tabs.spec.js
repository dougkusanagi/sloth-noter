import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

test.beforeEach(async ({ page }) => {
  const document = {
    ...newDocument(),
    notes: ['Alpha', 'Beta', 'Gamma'].map((id) => ({
      id,
      name: `${id}.md`,
      body: `# ${id}`,
      revision: 1,
    })),
    openIds: ['Alpha', 'Beta', 'Gamma'],
    activeId: 'Beta',
  }
  await page.addInitScript(
    ({ key, document }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(document))
    },
    { key: STORAGE_KEY, document },
  )
  await page.goto('/')
  await expect(page.locator('.tab')).toHaveCount(3)
})

const names = (page) => page.locator('.tab span')

test('dragging reorders tabs in both directions and persists across reload', async ({ page }) => {
  const first = await page.locator('.tab').first().boundingBox()
  const last = await page.locator('.tab').last().boundingBox()
  await page.mouse.move(first.x + 20, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(last.x + last.width - 5, last.y + last.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(names(page)).toHaveText(['Beta.md', 'Gamma.md', 'Alpha.md'])
  await expect(page.locator('.tab.active')).toHaveText('Beta.md')
  await page.reload()
  await expect(names(page)).toHaveText(['Beta.md', 'Gamma.md', 'Alpha.md'])
  const end = await page.locator('.tab').last().boundingBox()
  const start = await page.locator('.tab').first().boundingBox()
  await page.mouse.move(end.x + 20, end.y + end.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + 5, start.y + start.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(names(page)).toHaveText(['Alpha.md', 'Beta.md', 'Gamma.md'])
})

test('pinning persists, prevents accidental closes and can be undone', async ({ page }) => {
  await page.locator('.tab').last().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Fixar aba', exact: true }).click()
  await expect(names(page)).toHaveText(['Gamma.md', 'Alpha.md', 'Beta.md'])
  await expect(page.locator('.tab-wrap.pinned .tab-close')).toHaveCount(0)
  await page.locator('.tab-wrap.pinned .tab').click()
  await page.keyboard.press('Control+w')
  await expect(names(page)).toHaveCount(3)
  await page.locator('.tab-wrap.pinned .tab').click({ button: 'middle' })
  await expect(names(page)).toHaveCount(3)
  await page.reload()
  await expect(page.locator('.tab-wrap.pinned .tab')).toHaveText('Gamma.md')
  await page.locator('.tab-wrap.pinned .tab').click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: /^Fechar aba/ })).toBeDisabled()
  await page.getByRole('menuitem', { name: 'Desafixar aba', exact: true }).click()
  await expect(page.locator('.tab-wrap.pinned')).toHaveCount(0)
  await page.getByRole('button', { name: 'Fechar aba: Gamma.md' }).click()
  await expect(names(page)).toHaveCount(2)
})

test('keyboard menu provides reordering without dragging', async ({ page }) => {
  await page.locator('.tab').last().focus()
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Mover aba para a esquerda' }).click()
  await expect(names(page)).toHaveText(['Alpha.md', 'Gamma.md', 'Beta.md'])
})
