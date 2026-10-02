import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackup, readBackup } from './backup.js'
import { newDocument } from './storage.js'

test('backup round trip preserves notes, trash, tabs and preferences', () => {
  const document = newDocument()
  document.notes[0].body = 'olá\n\nlast line\n'
  document.trash.push({
    note: { id: 'deleted', name: 'deleted.md', body: '🦥\n', revision: 1 },
    index: 0,
    deletedAt: 123,
  })
  assert.deepEqual(readBackup(createBackup(document)), document)
})

test('rejects malformed or inconsistent backups', () => {
  assert.throws(() => readBackup('{bad'))
  assert.throws(
    () => readBackup(JSON.stringify({ ...newDocument(), activeId: 'missing' })),
    /Invalid active note/,
  )
})

test('full backup embeds native files and restores image references in notes and trash', async () => {
  const { createFullBackup, readBackupBundle, restoreBackupImages } = await import('./backup.js')
  const document = newDocument()
  document.notes[0].body = '![Foto](assets/foto.png)'
  document.trash = [
    {
      note: {
        id: 'deleted',
        name: 'deleted.md',
        revision: 1,
        body: '![Foto][foto]\n\n[foto]: assets/foto.png',
      },
      index: 0,
      deletedAt: 123,
    },
  ]
  const calls = []
  const invoke = async (command, args) => {
    calls.push([command, args])
    if (command === 'image_list') return ['assets/foto.png', 'assets/unused.png']
    if (command === 'image_read') return [137, 80, 78, 71]
  }
  const bundle = readBackupBundle(await createFullBackup(document, invoke))
  assert.equal(bundle.images.length, 2)
  const web = await restoreBackupImages(bundle)
  assert.match(web.notes[0].body, /data:image\/png;base64,/)
  assert.match(web.trash[0].note.body, /\[foto\]: data:image\/png;base64,/)
  const native = await restoreBackupImages(bundle, invoke)
  assert.equal(native.assets.length, 2)
  assert.notEqual(native.assets[0].src, 'assets/foto.png')
  assert.ok(calls.some(([command]) => command === 'image_write'))
})
test('failed image restoration cleans up files already written', async () => {
  const { restoreBackupImages } = await import('./backup.js')
  const removed = []
  let writes = 0
  await assert.rejects(
    restoreBackupImages(
      {
        document: newDocument(),
        images: [
          { name: 'a.png', src: 'assets/a.png', data: 'data:image/png;base64,AQ==' },
          { name: 'b.png', src: 'assets/b.png', data: 'data:image/png;base64,AQ==' },
        ],
      },
      async (command, args) => {
        if (command === 'image_write' && ++writes === 2) throw new Error('disk full')
        if (command === 'image_delete') removed.push(args.name)
      },
    ),
    /disk full/,
  )
  assert.equal(removed.length, 1)
})
