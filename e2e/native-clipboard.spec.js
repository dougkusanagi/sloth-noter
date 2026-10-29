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
      window.nativeWindowActions = []
      window.__TAURI_INTERNALS__ = {
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        transformCallback: () => 1,
        invoke: async (command, args) => {
          if (command === 'plugin:event|listen') return 1
          if (command === 'plugin:event|unlisten') return null
          if (
            ['minimize', 'toggle_maximize', 'close'].some(
              (action) => command === `plugin:window|${action}`,
            )
          ) {
            window.nativeWindowActions.push(command)
            return null
          }
          if (command === 'read_state') return JSON.stringify(window.nativeDocument)
          if (command === 'write_state') {
            window.nativeDocument = JSON.parse(args.contents)
            return null
          }
          if (command === 'vault_status') return { path: null, available: false }
          if (command === 'persistence_info') return { statePath: '/native/state.json' }
          if (command === 'clipboard_read') {
            window.nativeClipboardReads++
            if (window.holdClipboardRead)
              await new Promise((resolve) => {
                window.releaseClipboardRead = resolve
              })
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
          if (command === 'image_list') {
            window.nativeImageListReads = (window.nativeImageListReads ?? 0) + 1
            return Object.keys(window.nativeImages)
          }
          throw new Error(`Unsupported test IPC command: ${command}`)
        },
      }
    },
    { document, png },
  )
  await page.goto('/')
  await expect(page.locator('.cm-content')).toBeVisible()
})

test('desktop clicks invoke window actions only through their own controls', async ({ page }) => {
  await page.locator('.cm-content').click()
  await page.getByRole('button', { name: 'Menu principal', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Aparência do texto', exact: true }).click()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => window.nativeWindowActions)).toEqual([])
  await page.getByRole('button', { name: 'Minimizar', exact: true }).click()
  await page.getByRole('button', { name: 'Maximizar janela', exact: true }).click()
  await page.getByRole('button', { name: 'Fechar janela', exact: true }).click()
  expect(await page.evaluate(() => window.nativeWindowActions)).toEqual([
    'plugin:window|minimize',
    'plugin:window|toggle_maximize',
    'plugin:window|close',
  ])
})

for (const mode of ['visual', 'source']) {
  test(`opening or refocusing the editor cannot paste populated clipboard events in ${mode}`, async ({
    page,
  }) => {
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    for (const refocus of [false, true]) {
      if (refocus)
        await editor.evaluate((element) => {
          // A context menu from the previous visit must not authorize a paste on return.
          element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
          window.dispatchEvent(new Event('blur'))
          window.dispatchEvent(new Event('focus'))
        })
      const allowed = await editor.evaluate((element) =>
        ['text', 'image'].map((kind) => {
          const clipboardData = new DataTransfer()
          if (kind === 'text') clipboardData.setData('text/plain', 'Unrequested text')
          else
            clipboardData.items.add(new File(['image'], 'unrequested.png', { type: 'image/png' }))
          return element.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
          )
        }),
      )
      expect(allowed).toEqual([false, false])
    }
    expect(await page.evaluate(() => window.nativeClipboardReads)).toBe(0)
    expect(await page.evaluate(() => window.nativeDocument.notes[0].body)).toBe(
      '# Clipboard\n\nAntes\n\nDepois',
    )
    expect(await page.evaluate(() => Object.keys(window.nativeImages))).toEqual([])
  })

  test(`paste input without an authorized paste event is blocked in ${mode}`, async ({ page }) => {
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    expect(
      await editor.evaluate((element) =>
        element.dispatchEvent(
          new InputEvent('beforeinput', {
            inputType: 'insertFromPaste',
            data: 'Unrequested text',
            bubbles: true,
            cancelable: true,
          }),
        ),
      ),
    ).toBe(false)
    expect(await page.evaluate(() => window.nativeDocument.notes[0].body)).toBe(
      '# Clipboard\n\nAntes\n\nDepois',
    )
  })

  test(`unsolicited empty paste events never read the native clipboard in ${mode}`, async ({
    page,
  }) => {
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    for (const kind of ['text', 'image']) {
      await page.evaluate((kind) => {
        if (kind === 'text') window.nativeClipboard = { kind, text: 'Unrequested text' }
        else window.nativeClipboard = { kind, bytes: [1, 2, 3] }
      }, kind)
      for (let i = 0; i < 3; i++) {
        await editor.evaluate((element) =>
          element.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: new DataTransfer(),
              bubbles: true,
              cancelable: true,
            }),
          ),
        )
        expect(await page.evaluate(() => window.nativeClipboardReads)).toBe(0)
      }
    }
    expect(await page.evaluate(() => window.nativeDocument.notes[0].body)).toBe(
      '# Clipboard\n\nAntes\n\nDepois',
    )
    expect(await page.evaluate(() => Object.keys(window.nativeImages))).toEqual([])
  })

  test(`background paste events cannot insert text or images in ${mode}`, async ({ page }) => {
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.evaluate(() => {
      Object.defineProperty(document, 'hasFocus', { value: () => false, configurable: true })
    })
    const allowed = await editor.evaluate((element) => {
      return ['empty', 'text', 'image'].map((kind) => {
        const clipboardData = new DataTransfer()
        if (kind === 'text') clipboardData.setData('text/plain', 'Background text')
        if (kind === 'image')
          clipboardData.items.add(new File(['image'], 'background.png', { type: 'image/png' }))
        return element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
        )
      })
    })
    expect(allowed).toEqual([false, false, false])
    await page.keyboard.press('Control+v')
    expect(await page.evaluate(() => window.nativeClipboardReads)).toBe(0)
    expect(await page.evaluate(() => window.nativeDocument.notes[0].body)).toBe(
      '# Clipboard\n\nAntes\n\nDepois',
    )
    expect(await page.evaluate(() => Object.keys(window.nativeImages))).toEqual([])
  })

  for (const kind of ['text', 'image']) {
    test(`pending native ${kind} paste is cancelled after losing window focus in ${mode}`, async ({
      page,
    }) => {
      if (mode === 'source')
        await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
      await page.evaluate((kind) => {
        window.holdClipboardRead = true
        if (kind === 'text') window.nativeClipboard = { kind, text: 'Delayed text' }
      }, kind)
      const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
      await editor.focus()
      await page.keyboard.press('Control+v')
      await expect.poll(() => page.evaluate(() => window.nativeClipboardReads)).toBe(1)
      await page.evaluate(async () => {
        window.dispatchEvent(new Event('blur'))
        window.dispatchEvent(new Event('focus'))
        window.releaseClipboardRead()
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      })
      expect(await page.evaluate(() => window.nativeDocument.notes[0].body)).toBe(
        '# Clipboard\n\nAntes\n\nDepois',
      )
      expect(await page.evaluate(() => Object.keys(window.nativeImages))).toEqual([])
    })
  }

  test(`middle-click on editor padding cannot paste clipboard text in ${mode}`, async ({
    page,
  }) => {
    await page.evaluate(() => {
      window.nativeClipboard = { kind: 'text', text: 'Unexpected clipboard text' }
    })
    if (mode === 'source')
      await page.getByRole('radio', { name: 'Código', exact: true }).check({ force: true })
    const editor = page.locator(mode === 'visual' ? '.cm-content' : 'textarea')
    await editor.focus()
    await page.locator('.editor-shell').evaluate((shell) => {
      // The webview can target padding for the mouse event, then paste into the focused editor.
      for (const type of ['mousedown', 'mouseup', 'auxclick']) {
        shell.dispatchEvent(new MouseEvent(type, { button: 1, bubbles: true, cancelable: true }))
      }
    })
    const allowed = await editor.evaluate((element) => {
      const clipboardData = new DataTransfer()
      const emptyAllowed = element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      )
      clipboardData.setData('text/plain', 'Unexpected selection text')
      const textAllowed = element.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
      )
      return { emptyAllowed, textAllowed }
    })
    expect(allowed).toEqual({ emptyAllowed: false, textAllowed: false })
    expect(await page.evaluate(() => window.nativeClipboardReads)).toBe(0)
    expect(await page.evaluate(() => window.nativeDocument.notes[0].body)).toBe(
      '# Clipboard\n\nAntes\n\nDepois',
    )
  })

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

test('image library refreshes on focus and periodically without a refresh button', async ({
  page,
}) => {
  await page.clock.install()
  await page.keyboard.press('Control+Shift+l')
  await expect(page.getByRole('button', { name: 'Atualizar imagens', exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    window.nativeImages['Primeira.png'] = []
    window.dispatchEvent(new Event('focus'))
  })
  await expect(page.locator('.image-name', { hasText: 'Primeira.png' })).toBeVisible()
  await page.evaluate(() => {
    window.nativeImages['Segunda.png'] = []
  })
  await page.clock.runFor(15001)
  await expect(page.locator('.image-name', { hasText: 'Segunda.png' })).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar/ocultar biblioteca', exact: true }).click()
  const reads = await page.evaluate(() => window.nativeImageListReads)
  await page.clock.runFor(15001)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  expect(await page.evaluate(() => window.nativeImageListReads)).toBe(reads)
})

for (const platform of ['Linux x86_64', 'MacIntel']) {
  test(`focus keeps native window controls usable and separate from the exit in ${platform}`, async ({
    page,
  }) => {
    await page.addInitScript(
      (platform) => Object.defineProperty(navigator, 'platform', { value: platform }),
      platform,
    )
    await page.reload()
    await expect(page.locator('.cm-content')).toBeVisible()
    await page.keyboard.press('Control+Alt+f')
    await expect(page.locator('.app')).toHaveClass('app focus-mode')
    await expect(page.locator('.app-header')).toBeVisible()
    await expect(page.locator('.menu-trigger')).toBeHidden()
    await expect(page.locator('.tabs')).toBeHidden()
    await expect(page.locator('.document-info')).toBeHidden()
    await expect(page.locator('.notes-sidebar')).toHaveCount(0)
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await expect(page.getByRole('button', { name: 'Minimizar', exact: true })).toBeInViewport()
      await expect(
        page.getByRole('button', { name: 'Maximizar janela', exact: true }),
      ).toBeInViewport()
      await expect(
        page.getByRole('button', { name: 'Fechar janela', exact: true }),
      ).toBeInViewport()
      await page.locator('.focus-exit-region').hover()
      const controls = await page.locator('.window-controls').boundingBox()
      const exit = await page.locator('.focus-exit').boundingBox()
      expect(exit.x >= controls.x + controls.width || exit.x + exit.width <= controls.x).toBe(true)
      expect(
        await page
          .locator('.window-drag-space')
          .evaluate((el) => el.getBoundingClientRect().width > innerWidth / 2),
      ).toBe(true)
    }
    await page.getByRole('button', { name: 'Minimizar', exact: true }).click()
    await page.getByRole('button', { name: 'Maximizar janela', exact: true }).click()
    await page.getByRole('button', { name: 'Fechar janela', exact: true }).click()
    expect(await page.evaluate(() => window.nativeWindowActions)).toEqual([
      'plugin:window|minimize',
      'plugin:window|toggle_maximize',
      'plugin:window|close',
    ])
    await page.keyboard.press('Escape')
    await expect(page.locator('.app')).toHaveClass('app')
    await expect(page.locator('.menu-trigger')).toBeVisible()
  })
}
