import test from 'node:test'
import assert from 'node:assert/strict'
import { importImage, bytesDataUrl, markdownImage, libraryImages } from './images.js'
test('imports actual raster bytes even without a browser MIME type and rejects disguised text', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const file = { name: 'photo.png', size: bytes.length, arrayBuffer: async () => bytes.buffer }
  assert.equal(await importImage(file), bytesDataUrl(bytes, 'photo.png'))
  await assert.rejects(
    importImage({
      ...file,
      arrayBuffer: async () => new TextEncoder().encode('not an image').buffer,
    }),
  )
  assert.equal(markdownImage('Foto', 'assets/my photo.png'), '![Foto](<assets/my photo.png>)')
})

test('desktop imports persist the original image bytes through the native writer', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const calls = []
  const src = await importImage(
    { name: 'foto.png', size: bytes.length, arrayBuffer: async () => bytes.buffer },
    async (command, args) => calls.push({ command, args }),
  )
  assert.match(src, /^assets\/.*-foto\.png$/)
  assert.equal(calls[0].command, 'image_write')
  assert.equal(calls[0].args.name, src)
  assert.deepEqual(calls[0].args.bytes, [...bytes])
})

test('library paths are normalized so usage and deletion agree for legacy images', () => {
  const document = {
    notes: [{ id: 'active', body: '![Foto](<./photos/Pasted image.png>)' }],
    trash: [],
    assets: [{ src: './photos/Pasted%20image.png', name: 'Foto' }],
  }
  const disk = [{ src: 'photos/Pasted image.png', name: 'Pasted image.png' }]
  assert.deepEqual(libraryImages(document, disk), [
    {
      src: 'photos/Pasted image.png',
      name: 'Foto',
      noteIds: ['active'],
    },
  ])
  document.trash = [{ note: document.notes[0] }]
  document.notes = []
  assert.deepEqual(libraryImages(document, disk)[0].noteIds, ['active'])
  document.trash = []
  assert.deepEqual(libraryImages(document, disk)[0].noteIds, [])
})
