import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

test.beforeEach(async ({ page }) => {
  const document = {
    ...newDocument(),
    notes: ['Alpha', 'Beta', 'Gamma'].map((id) => ({
      id,
      name: `${id}.md`,
      body: `# ${id}\n\n${id === 'Beta' ? 'Planejamento da semana\n\n- [ ] Revisar as prioridades' : 'Anotações e referências do projeto.'}`,
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

test('a tab can be viewed beside the active note and switched for editing', async ({ page }) => {
  if (process.env.CAPTURE_UI) {
    await page.setViewportSize({ width: 760, height: 720 })
    await page.evaluate((key) => {
      const document = JSON.parse(localStorage.getItem(key))
      document.preferences.fontSize = 24
      localStorage.setItem(key, JSON.stringify(document))
    }, STORAGE_KEY)
    await page.reload()
    await expect(page.locator('.tab')).toHaveCount(3)
    await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca' }).click()
  }
  await page.locator('.tab').filter({ hasText: 'Alpha' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Ver ao lado' }).click()
  const side = page.getByRole('complementary', { name: 'Nota ao lado: Alpha' })
  await expect(side).toContainText('Alpha')
  await expect(page.locator('.editor-pane-primary')).toContainText('Beta')
  await expect(side.getByRole('textbox', { name: 'Editor Markdown visual' })).toHaveAttribute(
    'aria-readonly',
    'true',
  )
  if (process.env.CAPTURE_UI)
    await page.locator('.editor-panes').screenshot({ path: '/tmp/sloth-split-desktop.png' })
  await side.getByRole('button', { name: 'Editar Alpha', exact: true }).click()
  await expect(page.locator('.editor-pane-primary')).toContainText('Alpha')
  await expect(page.getByRole('complementary', { name: 'Nota ao lado: Beta' })).toBeVisible()
  await page.getByRole('button', { name: 'Fechar nota ao lado' }).click()
  await expect(page.locator('.editor-pane-secondary')).toHaveCount(0)
})

test('dragging a tab onto the editor opens it alongside', async ({ page }) => {
  const tab = await page.locator('.tab').filter({ hasText: 'Gamma' }).boundingBox()
  const editor = await page.locator('.editor-shell').boundingBox()
  await page.mouse.move(tab.x + 20, tab.y + tab.height / 2)
  await page.mouse.down()
  await page.mouse.move(editor.x + editor.width / 2, editor.y + 150, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('complementary', { name: 'Nota ao lado: Gamma' })).toBeVisible()
})

test('two notes remain readable at a narrow desktop window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.tab').filter({ hasText: 'Alpha' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Ver ao lado' }).click()
  const side = page.getByRole('complementary', { name: 'Nota ao lado: Alpha' })
  await side.scrollIntoViewIfNeeded()
  await expect(side).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  if (process.env.CAPTURE_UI) await page.screenshot({ path: '/tmp/sloth-split-narrow.png' })
})

test('toggling a task in the side note changes that note only', async ({ page }) => {
  await page.locator('.tab').filter({ hasText: 'Alpha' }).click()
  await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
  await page.locator('textarea').fill('# Alpha\n\n- [ ] Revisar documento')
  await page.getByRole('radio', { name: 'Padrão', exact: true }).check({ force: true })
  await page.locator('.tab').filter({ hasText: 'Beta' }).click()
  await page.locator('.tab').filter({ hasText: 'Alpha' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Ver ao lado' }).click()
  const side = page.getByRole('complementary', { name: 'Nota ao lado: Alpha' })
  await side.getByRole('checkbox').check({ force: true })
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const document = JSON.parse(localStorage.getItem(key))
        return document.notes.find((note) => note.id === 'Alpha').body
      }, STORAGE_KEY),
    )
    .toContain('- [x] Revisar documento')
  await expect(page.locator('.editor-pane-primary')).toContainText('Beta')
})

test('each side scrolls independently when both notes are long', async ({ page }) => {
  await page.evaluate((key) => {
    const document = JSON.parse(localStorage.getItem(key))
    for (const note of document.notes)
      note.body = `# ${note.id}\n\n${'Texto de exemplo.\n\n'.repeat(120)}Fim ${note.id}`
    localStorage.setItem(key, JSON.stringify(document))
  }, STORAGE_KEY)
  await page.reload()
  await page.locator('.tab').filter({ hasText: 'Alpha' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Ver ao lado' }).click()
  const primary = page.locator('.editor-pane-primary > .visual-editor > .cm-editor > .cm-scroller')
  const side = page.locator('.editor-pane-secondary > .visual-editor > .cm-editor > .cm-scroller')
  await primary.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await expect.poll(() => primary.evaluate((node) => node.scrollTop)).toBeGreaterThan(100)
  expect(await side.evaluate((node) => node.scrollTop)).toBe(0)
  await side.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await expect.poll(() => side.evaluate((node) => node.scrollTop)).toBeGreaterThan(100)
  await page.getByRole('button', { name: 'Editar Alpha' }).click()
  await expect(page.locator('.editor-pane-primary')).toContainText('Alpha')
})

test('dragging reorders tabs in both directions and persists across reload', async ({ page }) => {
  const first = await page.locator('.tab').first().boundingBox()
  const last = await page.locator('.tab').last().boundingBox()
  await page.mouse.move(first.x + 20, first.y + first.height / 2)
  await page.mouse.down()
  await page.mouse.move(last.x + last.width - 5, last.y + last.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(names(page)).toHaveText(['Beta', 'Gamma', 'Alpha'])
  await expect(page.locator('.tab.active')).toHaveText('Beta')
  await page.reload()
  await expect(names(page)).toHaveText(['Beta', 'Gamma', 'Alpha'])
  const end = await page.locator('.tab').last().boundingBox()
  const start = await page.locator('.tab').first().boundingBox()
  await page.mouse.move(end.x + 20, end.y + end.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + 5, start.y + start.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(names(page)).toHaveText(['Alpha', 'Beta', 'Gamma'])
})

test('pinning persists, prevents accidental closes and can be undone', async ({ page }) => {
  await page.locator('.tab').last().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Fixar aba', exact: true }).click()
  await expect(names(page)).toHaveText(['Gamma', 'Alpha', 'Beta'])
  await expect(page.locator('.tab-wrap.pinned .tab-close')).toHaveCount(0)
  await page.locator('.tab-wrap.pinned .tab').click()
  await page.keyboard.press('Control+w')
  await expect(names(page)).toHaveCount(3)
  await page.locator('.tab-wrap.pinned .tab').click({ button: 'middle' })
  await expect(names(page)).toHaveCount(3)
  await page.reload()
  await expect(page.locator('.tab-wrap.pinned .tab')).toHaveText('Gamma')
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
  await expect(names(page)).toHaveText(['Alpha', 'Gamma', 'Beta'])
})
