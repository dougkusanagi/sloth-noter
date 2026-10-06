import test from 'node:test'
import assert from 'node:assert/strict'
import { clipboardImageFiles, readNativeClipboard } from './clipboard.js'

test('clipboard images are collected from files or item-only webview payloads', () => {
  const file = new File(['png'], 'image.png', { type: 'image/png' })
  const text = new File(['text'], 'note.txt', { type: 'text/plain' })
  assert.deepEqual(clipboardImageFiles({ files: [file, text] }), [file])
  assert.deepEqual(
    clipboardImageFiles({
      items: [
        { kind: 'file', type: 'image/png', getAsFile: () => file },
        { kind: 'string', type: 'text/plain' },
      ],
    }),
    [file],
  )
  assert.deepEqual(clipboardImageFiles(null), [])
})

test('native clipboard pixels become a PNG file for the existing image importer', async () => {
  const bytes = [137, 80, 78, 71, 13, 10, 26, 10]
  const contents = await readNativeClipboard(async (command) => {
    assert.equal(command, 'clipboard_read')
    return { kind: 'image', bytes }
  })
  assert.equal(contents.files[0].name, 'clipboard.png')
  assert.equal(contents.files[0].type, 'image/png')
  assert.deepEqual([...new Uint8Array(await contents.files[0].arrayBuffer())], bytes)
  assert.deepEqual(await readNativeClipboard(async () => ({ kind: 'text', text: 'texto' })), {
    kind: 'text',
    text: 'texto',
  })
  assert.equal(await readNativeClipboard(async () => null), null)
  await assert.rejects(
    readNativeClipboard(async () => {
      throw new Error('clipboard unavailable')
    }),
    /clipboard unavailable/,
  )
})
