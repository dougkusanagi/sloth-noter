import { test, expect } from '@playwright/test'
import { newDocument } from '../src/storage.js'

for (const historyEnabled of [false, true]) {
  test(`typing in an empty note stays responsive with a full library, history ${historyEnabled}`, async ({
    page,
  }, testInfo) => {
    const document = newDocument()
    document.preferences.historyEnabled = historyEnabled
    document.preferences.sidebarVisible = false
    document.notes = [
      { id: 'typing', name: 'Typing.md', body: '# Typing\n\n', revision: 0 },
      ...Array.from({ length: 36 }, (_, index) => ({
        id: `project-${index}`,
        name: `Projeto ${index}.md`,
        revision: 0,
        body:
          `# Projeto ${index}\n\n[[Typing]]\n\n![Foto](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=)\n\n` +
          Array.from(
            { length: 15 },
            (_, step) =>
              `## Etapa ${step}\n\nTexto de planejamento com **destaque**, [referência](https://example.test/${index}/${step}) e ação pendente para revisão.\n\n- [ ] Revisar tarefa ${step}\n- [x] Conferir conteúdo\n\n`,
          ).join(''),
      })),
    ]
    document.openIds = ['typing']
    document.activeId = 'typing'
    await page.addInitScript((document) => {
      window.nativeDocument = document
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        invoke: async (command, args) => {
          if (command === 'read_state') return JSON.stringify(window.nativeDocument)
          if (command === 'write_state') {
            window.nativeDocument = JSON.parse(args.contents)
            return null
          }
          if (command === 'vault_status') return { path: null, available: false }
          if (command === 'plugin:event|listen') return 1
          if (['image_list', 'take_opened_files'].includes(command)) return []
          return null
        },
      }
    }, document)
    await page.goto('/')
    const editor = page.getByRole('textbox', { name: 'Editor Markdown visual' })
    await editor.click()
    await page.keyboard.press('Control+End')
    await page.evaluate(() => {
      window.keyDelays = []
      document.addEventListener(
        'keydown',
        (event) => {
          if (event.key.length !== 1) return
          const start = performance.now()
          // Includes input handling and the React work before the next task.
          setTimeout(() => window.keyDelays.push(performance.now() - start), 0)
        },
        true,
      )
    })
    const text = 'digitacao sem atrasos'
    await page.keyboard.type(text, { delay: 10 })
    await expect(editor).toContainText(text)
    await expect.poll(() => page.evaluate(() => window.keyDelays.length)).toBe(text.length)
    const delays = await page.evaluate(() => window.keyDelays.toSorted((a, b) => a - b))
    // A 150+ ms parse of the entire library per key used to queue up fast typing.
    expect(delays[Math.floor(delays.length / 2)]).toBeLessThan(60)
    await expect
      .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
      .toContain(text)
    await expect(page.locator('.backlinks summary')).toHaveText('36 links inversos')
    if (historyEnabled) {
      for (const [width, height] of [
        [1280, 800],
        [390, 844],
      ]) {
        await page.setViewportSize({ width, height })
        await expect(editor).toBeInViewport()
        await expect(page.locator('.tab-new')).toBeInViewport()
        await page.screenshot({ path: testInfo.outputPath(`typing-${width}.png`) })
      }
    }
  })
}
