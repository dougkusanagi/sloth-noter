import { test, expect } from '@playwright/test'
import { newDocument, STORAGE_KEY } from '../src/storage.js'

for (const runtime of ['web', 'desktop']) {
  for (const width of [390, 1280]) {
    for (const mode of ['Padrão', 'Código']) {
      test(`tabs retain independent scroll and selections in ${mode}, ${runtime}, ${width}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 })
        const document = {
          ...newDocument(),
          notes: ['Longa', 'Curta'].map((id) => ({
            id,
            name: `${id}.md`,
            body: `# ${id}\n\n${id === 'Longa' ? 'Parágrafo com acentuação e palavras para editar.\n\n'.repeat(180).trimEnd() : 'Nota curta.'}`,
            revision: 1,
          })),
          openIds: ['Longa', 'Curta'],
          activeId: 'Longa',
        }
        await page.addInitScript(
          ({ key, document, runtime }) => {
            if (runtime === 'web') localStorage.setItem(key, JSON.stringify(document))
            else {
              window.nativeDocument = document
              window.__TAURI_INTERNALS__ = {
                metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
                transformCallback: () => 1,
                invoke: async (command, args) => {
                  if (command === 'read_state') return JSON.stringify(window.nativeDocument)
                  if (command === 'write_state') window.nativeDocument = JSON.parse(args.contents)
                  if (command === 'vault_status') return { path: null, available: false }
                  if (command === 'plugin:event|listen') return 1
                  if (['image_list', 'take_opened_files'].includes(command)) return []
                  return null
                },
              }
            }
          },
          { key: STORAGE_KEY, document, runtime },
        )
        await page.goto('/')
        await page.getByRole('radio', { name: mode, exact: true }).check({ force: true })
        const editor = page.locator(mode === 'Padrão' ? '.cm-content' : 'textarea')
        await editor.focus()
        await page.keyboard.press('Control+End')
        await page.keyboard.press('Shift+Home')
        // Scroll away from the selected cursor: restoring just the cursor is insufficient.
        await page.evaluate(() => {
          if (document.querySelector('textarea'))
            document.querySelector('textarea').scrollTop = 1300
          window.scrollTo(0, 900)
        })
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        )
        const position = () =>
          page.evaluate(() => ({
            window: window.scrollY,
            editor: document.querySelector('textarea, .cm-scroller').scrollTop,
          }))
        const before = await position()
        expect(before.window + before.editor).toBeGreaterThan(500)
        for (const method of ['mouse', 'keyboard']) {
          if (method === 'mouse') await page.locator('[data-tab-id="Curta"] .tab').click()
          else await page.keyboard.press('Control+2')
          await expect(page.locator('.tab.active')).toHaveText('Curta')
          await expect.poll(position).toEqual({ window: 0, editor: 0 })
          if (method === 'mouse') await page.locator('[data-tab-id="Longa"] .tab').click()
          else await page.keyboard.press('Control+1')
          await expect(page.locator('.tab.active')).toHaveText('Longa')
          await expect.poll(position).toEqual(before)
        }
        await page.evaluate(() => {
          window.dispatchEvent(new Event('blur'))
          window.dispatchEvent(new Event('focus'))
        })
        await expect.poll(position).toEqual(before)
        await expect(editor).toBeFocused()
        if (process.env.CAPTURE_UI && runtime === 'desktop') {
          await page.screenshot({ path: `/tmp/sloth-tab-position-${mode}-${width}.png` })
        }
        await page.keyboard.type('Seleção preservada')
        await expect
          .poll(() =>
            page.evaluate(
              (key) =>
                (window.nativeDocument ?? JSON.parse(localStorage.getItem(key))).notes[0].body,
              STORAGE_KEY,
            ),
          )
          .toBe(`${document.notes[0].body.replace(/[^\n]+$/, '')}Seleção preservada`)
      })
    }
  }
}
