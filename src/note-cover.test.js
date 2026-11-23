import assert from 'node:assert/strict'
import { test } from 'node:test'
import { noteCover, setNoteCover } from './note-cover.js'
import { libraryImages, removeDocumentImage, replaceDocumentImage } from './images.js'
import { assetReferences } from './sync/engine.js'

const photo = { name: 'Viagem [2026]', src: 'assets/viagem.png' }
const body = '---\ncidade: Recife\n---\n# Viagem\n\nRoteiro\n'

test('cover round trip preserves the title, metadata and body', () => {
  const withCover = setNoteCover(body, photo)
  assert.equal(noteCover(withCover).url, photo.src)
  assert.equal(noteCover(withCover).alt, 'Viagem 2026')
  assert.deepEqual(assetReferences(withCover), [photo.src])
  const other = { name: 'Passeio', src: 'assets/outra.png' }
  const replaced = setNoteCover(withCover, other)
  assert.deepEqual(assetReferences(replaced), [other.src])
  assert.equal(setNoteCover(replaced, null), body)
  assert.equal(noteCover(body + '\n![Foto](assets/x.png "sloth:cover")\n'), null)
})

test('library keeps the cover reference on rename and removes it on file deletion', () => {
  const covered = setNoteCover(body, photo)
  const document = {
    notes: [{ id: 'a', name: 'Viagem.md', body: covered, revision: 0 }],
    trash: [],
    assets: [photo],
  }
  assert.deepEqual(libraryImages(document)[0].noteIds, ['a'])
  const renamed = replaceDocumentImage(document, photo.src, 'assets/recife.png')
  assert.equal(noteCover(renamed.notes[0].body).url, 'assets/recife.png')
  const removed = removeDocumentImage(renamed, 'assets/recife.png')
  assert.equal(removed.notes[0].body, body)
})
