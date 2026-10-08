import { expect, test } from '@playwright/test'
import { newDocument } from '../src/storage.js'

const png = [
  ...Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1Z0AAAAASUVORK5CYII=',
    'base64',
  ),
]

test.beforeEach(async ({ page }) => {
  const document = newDocument()
  document.notes[0].body = '# Clipboard\n\nAntes\n\nDepois'
  await page.addInitScript(
    ({ document, png }) => {
      window.nativeDocument = document
      window.nativeClipboard = { kind: 'image', bytes: png }
      window.nativeClipboardReads = 0
      window.nativeImages = {}
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
          if (command === 'persistence_info') return { statePath: '/native/state.json' }
          if (command === 'clipboard_read') {
            window.nativeClipboardReads++
            if (window.clipboardDelay)
              await new Promise((resolve) => setTimeout(resolve, window.clipboardDelay))
            return window.nativeClipboard
          }
          if (command === 'image_write') {
            window.nativeImages[args.name] = args.bytes
            return null
          }
          if (command === 'image_delete') {
            if (window.nativeDeleteError) throw window.nativeDeleteError
            delete window.nativeImages[args.name]
            return null
          }
          if (command === 'image_read') return window.nativeImages[args.name]
          if (command === 'image_list') return Object.keys(window.nativeImages)
          throw new Error(`Unsupported test IPC command: ${command}`)
        },
      }
    },
    { document, png },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

for (const mode of ['visual', 'source']) {
  test(`middle-click paste cannot import native images or selection text in ${mode}`, async ({
    page,
  }) => {
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.click({ button: 'middle' })
    const allowed = await editor.evaluate((element) => {
      const clipboardData = new DataTransfer()
      // WebKit can emit an empty payload; the native fallback must stay blocked.
      const emptyAllowed = element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      )
      clipboardData.setData('text/plain', 'unwanted selection')
      const textAllowed = element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          cancelable: true,
        }),
      )
      return { emptyAllowed, textAllowed }
    })
    expect(allowed).toEqual({ emptyAllowed: false, textAllowed: false })
    expect(await page.evaluate(() => window.nativeClipboardReads)).toBe(0)
    expect(await page.evaluate(() => window.nativeDocument.notes[0].body)).toBe(
      '# Clipboard\n\nAntes\n\nDepois',
    )
    await editor.focus()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Control+v')
    await expect.poll(() => page.evaluate(() => window.nativeClipboardReads)).toBe(1)
    await expect.poll(() => page.evaluate(() => Object.keys(window.nativeImages).length)).toBe(1)
  })

  test(`desktop Ctrl+V imports native images at the ${mode} cursor and supports undo`, async ({
    page,
  }) => {
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Home')
    await page.keyboard.press('Control+v')
    await expect.poll(() => page.evaluate(() => Object.keys(window.nativeImages).length)).toBe(1)
    await expect
      .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
      .toMatch(/Antes\n\n!\[clipboard.png\]\(assets\/[^)]+\)\nDepois$/)
    expect(await page.evaluate(() => window.nativeClipboardReads)).toBe(1)
    await expect(editor).toBeFocused()
    await page.keyboard.press('Control+z')
    await expect
      .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
      .toBe('# Clipboard\n\nAntes\n\nDepois')
  })

  test(`desktop ${mode} text paste replaces the selection`, async ({ page }) => {
    await page.evaluate(() => {
      window.nativeClipboard = { kind: 'text', text: 'Texto colado' }
    })
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.keyboard.press('Control+End')
    await page.keyboard.press('Shift+Home')
    await page.keyboard.press('Control+v')
    await expect
      .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
      .toBe('# Clipboard\n\nAntes\n\nTexto colado')
    await page.keyboard.press('Control+z')
    await expect
      .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
      .toBe('# Clipboard\n\nAntes\n\nDepois')
  })
}

test('a native image paste retains its destination while another note opens', async ({ page }) => {
  await page.evaluate(() => {
    window.clipboardDelay = 400
  })
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+v')
  await page.keyboard.press('Control+t')
  await expect(page.locator('.tab')).toHaveCount(2)
  await expect
    .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
    .toMatch(/!\[clipboard.png\]/)
  expect(await page.evaluate(() => window.nativeDocument.notes[1].body)).not.toContain(
    'clipboard.png',
  )
})

test('desktop library drag inserts the existing asset without a native file import', async ({
  page,
}) => {
  await page.locator('.cm-content').focus()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Control+v')
  await expect.poll(() => page.evaluate(() => Object.keys(window.nativeImages).length)).toBe(1)
  await expect
    .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
    .toMatch(/clipboard.png/)
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+Shift+l')
  const item = page.locator('.image-item img')
  await expect(item).toBeVisible()
  const from = await item.boundingBox()
  const to = await page.locator('.cm-line').filter({ hasText: 'Depois' }).boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + 2, to.y + 10, { steps: 10 })
  await page.mouse.up()
  await expect
    .poll(() => page.evaluate(() => window.nativeDocument.notes[0].body))
    .toMatch(/Antes\n\n!\[clipboard.png\]\(assets\/[^)]+\)\nDepois$/)
  expect(await page.evaluate(() => Object.keys(window.nativeImages).length)).toBe(1)
  await expect(page.getByText(/Falha na importação/)).toHaveCount(0)
})

for (const name of ['Pasted image 2026.png', 'photos/Pasted image.png']) {
  test(`an unused desktop library image outside assets can be deleted: ${name}`, async ({
    page,
  }) => {
    await page.evaluate(
      ({ name, png }) => {
        window.nativeImages[name] = png
      },
      { name, png },
    )
    await page.keyboard.press('Control+Shift+l')
    await expect(page.locator('.image-item')).toHaveCount(1)
    await expect(page.locator('.image-item')).toContainText('Sem uso')
    await page.locator('.image-item').click({ button: 'right' })
    const remove = page.getByRole('menuitem', { name: 'Excluir imagem', exact: true })
    await expect(remove).toBeEnabled()
    await remove.click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Excluir imagem', exact: true })
      .click()
    await expect(page.locator('.image-item')).toHaveCount(0)
    expect(await page.evaluate(() => Object.keys(window.nativeImages))).toEqual([])
  })
}

test('an actual reference reported by the backend gives a localized deletion error with the note name', async ({
  page,
}) => {
  await page.evaluate((png) => {
    window.nativeImages['photo.png'] = png
    window.nativeDeleteError = '[image-in-use] Fotos.md'
  }, png)
  await page.keyboard.press('Control+Shift+l')
  await page.locator('.image-item').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Excluir imagem', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Excluir imagem', exact: true })
    .click()
  await expect(
    page.getByText(
      'Não foi possível excluir a imagem: A imagem ainda é usada em: Fotos.md. Remova essas referências antes de excluir.',
    ),
  ).toBeVisible()
  await expect(page.getByText(/Falha na importação/)).toHaveCount(0)
  await expect(page.locator('.image-item')).toHaveCount(1)
  expect(await page.evaluate(() => Object.keys(window.nativeImages))).toEqual(['photo.png'])
})
