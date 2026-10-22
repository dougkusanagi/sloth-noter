import { test, expect } from '@playwright/test'
import { newDocument } from '../src/storage.js'

export async function historyFixture(page, { enabled = true } = {}) {
  const document = newDocument()
  if (enabled === null) delete document.preferences.historyEnabled
  else document.preferences.historyEnabled = enabled
  document.notes[0].body = '# Histórico\n\nTexto original ' + 'trecho importante '.repeat(30)
  await page.addInitScript(
    ({ document }) => {
      window.nativeDocument = document
      window.historyEntries = []
      window.nativeWrites = 0
      window.historyAppendCalls = 0
      window.historyObjects = {}
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        invoke: async (command, args) => {
          if (command === 'read_state') return JSON.stringify(window.nativeDocument)
          if (command === 'write_state') {
            window.nativeWrites++
            window.nativeDocument = JSON.parse(args.contents)
            return null
          }
          if (command === 'vault_status') return { path: null, available: false }
          if (command === 'persistence_info') return { statePath: '/native/state.json' }
          if (command === 'history_append') {
            window.historyAppendCalls++
            if (window.holdHistoryAppend)
              await new Promise((resolve) => {
                window.releaseHistoryAppend = resolve
              })
            for (const entry of args.entries) {
              const objeto = String(window.historyEntries.length)
              window.historyObjects[objeto] = entry.depois
              window.historyEntries.push({ ...entry, objeto })
            }
            return null
          }
          if (command === 'history_list')
            return window.historyEntries.filter((e) => e.nota === args.id)
          if (command === 'history_object') return window.historyObjects[args.hash]
          if (command === 'history_clear') {
            window.historyEntries = window.historyEntries.filter(
              (e) => args.id && e.nota !== args.id,
            )
            return null
          }
          if (command === 'image_list' || command === 'take_opened_files') return []
          if (command === 'plugin:event|listen') return 1
          return null
        },
      }
    },
    { document },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
}

test('captures editing, paste and large deletion, then restores', async ({ page }) => {
  await historyFixture(page)
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' edição')
  await page.keyboard.press('Control+v')
  await editor.evaluate((el) =>
    el.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: (() => {
          const data = new DataTransfer()
          data.setData('text/plain', ' COLADO')
          return data
        })(),
      }),
    ),
  )
  await expect(editor).toContainText('COLADO')
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Histórico da nota' }).click()
  const dialog = page.getByRole('dialog', { name: 'Histórico da nota' })
  await expect(dialog.getByText('Remoção grande', { exact: true })).toBeVisible()
  await dialog.getByRole('button').filter({ hasText: 'Colado' }).first().click()
  await dialog.getByRole('button', { name: 'Restaurar esta versão' }).click()
  await expect(editor).toContainText('COLADO')
  await expect
    .poll(() => page.evaluate(() => window.historyEntries.some((e) => e.origem === 'restauracao')))
    .toBe(true)
})

test('history fits desktop and mobile in both themes', async ({ page }) => {
  await historyFixture(page)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.press('Backspace')
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Histórico da nota' }).click()
  await page.getByRole('button').filter({ hasText: 'Remoção grande' }).click()
  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme)
      await page.screenshot({ path: `/tmp/history-${width}-${theme}.png`, animations: 'disabled' })
      const dialog = page.getByRole('dialog', { name: 'Histórico da nota' })
      expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const bounds = await dialog.boundingBox()
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
      await dialog.getByRole('button', { name: 'Restaurar esta versão' }).scrollIntoViewIfNeeded()
      await expect(dialog.getByRole('button', { name: 'Restaurar esta versão' })).toBeInViewport()
    }
  }
})

test('disabling and clearing history keeps note content', async ({ page }) => {
  await historyFixture(page)
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Histórico da nota' }).click()
  const dialog = page.getByRole('dialog', { name: 'Histórico da nota' })
  await dialog.getByRole('checkbox').uncheck()
  await expect(dialog.getByText(/Histórico desligado/)).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.nativeDocument.preferences.historyEnabled))
    .toBe(false)
  await dialog.getByText('Apagar histórico', { exact: true }).click()
  await dialog.getByRole('button', { name: 'Apagar histórico desta nota', exact: true }).click()
  await dialog.getByRole('button', { name: 'Confirmar exclusão' }).click()
  await expect(dialog.getByText(/Nenhuma versão guardada/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
  await expect(page.locator('.cm-content')).toContainText('Texto original')
})

test('typing and saving continue while the history disk write is stalled', async ({ page }) => {
  await page.clock.install()
  await historyFixture(page)
  await page.evaluate(() => {
    window.holdHistoryAppend = true
  })
  await page.clock.runFor(3100)
  await expect.poll(() => page.evaluate(() => window.historyAppendCalls)).toBeGreaterThan(0)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' DIGITACAO CONTINUA SALVA')
  await expect(page.locator('.cm-content')).toContainText('DIGITACAO CONTINUA SALVA')
  await expect
    .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
    .toContain('DIGITACAO CONTINUA SALVA')
  await page.evaluate(() => {
    window.holdHistoryAppend = false
    window.releaseHistoryAppend()
  })
})

test('history stays inactive unless explicitly enabled, including older preferences', async ({
  page,
}) => {
  await page.clock.install()
  await historyFixture(page, { enabled: null })
  await expect(page.locator('.cm-content')).toBeVisible()
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.type(' SEM HISTORICO')
  await page.clock.runFor(11000)
  expect(await page.evaluate(() => window.historyAppendCalls)).toBe(0)
  await expect
    .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
    .toContain('SEM HISTORICO')
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Histórico da nota' }).click()
  const checkbox = page.getByRole('dialog', { name: 'Histórico da nota' }).getByRole('checkbox')
  await expect(checkbox).not.toBeChecked()
  await checkbox.check()
  await expect
    .poll(() => page.evaluate(() => window.nativeDocument.preferences.historyEnabled))
    .toBe(true)
})

test('typing with corrections and accents is batched into few history entries', async ({
  page,
}) => {
  await historyFixture(page)
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+End')
  for (let i = 0; i < 20; i++) {
    await page.keyboard.type('ab')
    await page.keyboard.press('Backspace')
  }
  await page.waitForTimeout(2600)
  const entries = await page.evaluate(() =>
    window.historyEntries.filter((e) => e.origem !== 'abertura'),
  )
  expect(entries.length).toBeLessThanOrEqual(2)
})
