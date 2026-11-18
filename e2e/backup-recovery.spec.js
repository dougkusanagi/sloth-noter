import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { readBackup } from '../src/backup.js'
import { newDocument } from '../src/storage.js'

test('failed native saves leave unsaved text available for download', async ({ page }) => {
  const document = newDocument()
  document.notes[0].body = '# Recuperação\n\n![Imagem indisponível](assets/foto.png)'
  await page.addInitScript((state) => {
    const callbacks = new Map()
    let callbackId = 0
    window.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
      transformCallback(handler) {
        callbacks.set(++callbackId, handler)
        return callbackId
      },
      async invoke(command, args) {
        if (command === 'read_state') return JSON.stringify(state)
        if (command === 'write_state') throw new Error('Teste: gravação indisponível')
        if (command === 'image_read') throw new Error('Invalid image path')
        if (command === 'image_list' || command === 'take_opened_files') return []
        if (command === 'plugin:event|listen') {
          if (args.event === 'tauri://close-requested') {
            window.requestNativeClose = () =>
              callbacks.get(args.handler)({ event: args.event, id: args.handler })
          }
          return args.handler
        }
        if (command === 'plugin:window|destroy') window.nativeWindowDestroyed = true
        return null
      },
    }
  }, document)
  await page.goto('/')
  const editor = page.locator('.cm-content')
  await editor.click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Enter')
  await page.keyboard.insertText('Edição ainda na memória')
  await expect(page.getByText(/Falha ao gravar:.*gravação indisponível/)).toBeVisible()
  await page.evaluate(() => window.requestNativeClose())
  const closeNotice = page.getByRole('listitem').filter({ hasText: 'A janela continua aberta' })
  await expect(closeNotice).toBeVisible()
  const pendingDownload = page.waitForEvent('download')
  await closeNotice.getByRole('button', { name: 'Baixar backup das notas' }).click()
  const download = await pendingDownload
  const restored = readBackup(await readFile(await download.path(), 'utf8'))
  expect(restored.notes[0].body).toContain('Edição ainda na memória')
  expect(restored.notes[0].body).toContain('assets/foto.png')
  expect(await page.evaluate(() => window.nativeWindowDestroyed)).toBeUndefined()
})
