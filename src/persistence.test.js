import test from 'node:test'
import assert from 'node:assert/strict'
import { createPersistence } from './persistence.js'
import { createWebAdapter } from './persistence-web.js'
import { createDesktopAdapter } from './persistence-desktop.js'
import { createBackup, readBackup } from './backup.js'
import { moveToTrash, nameFromHeading, purgeFromTrash, restoreFromTrash } from './notes.js'
import { STORAGE_KEY } from './storage.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, value),
    values,
  }
}

function memoryHost() {
  const files = new Map()
  let writeFailure = null
  let readFailure = null
  const invoke = async (command, args) => {
    if (command === 'read_state') {
      if (readFailure) throw new Error(readFailure)
      return files.has('state') ? files.get('state') : null
    }
    if (command === 'write_state') {
      if (writeFailure) throw new Error(writeFailure)
      files.set('state', args.contents)
      return null
    }
    if (command === 'persistence_info')
      return { kind: 'desktop', statePath: 'state.v3.json', appVersion: '0.1.0' }
    throw new Error(`unexpected command ${command}`)
  }
  return {
    invoke,
    files,
    failWritesWith: (error) => {
      writeFailure = error
    },
    failReadsWith: (error) => {
      readFailure = error
    },
  }
}

/**
 * The same domain suite runs against both implementations: the browser storage
 * used by the web app and the native state file used by the desktop app.
 */
const implementations = [
  {
    label: 'web',
    create() {
      const storage = memoryStorage()
      return {
        newPersistence: () => createPersistence(createWebAdapter(storage)),
        read: () => (storage.values.has(STORAGE_KEY) ? storage.values.get(STORAGE_KEY) : null),
        seed: (raw) => storage.values.set(STORAGE_KEY, raw),
        failWritesWith: (error) => {
          storage.setItem = () => {
            throw new Error(error)
          }
        },
        failReadsWith: (error) => {
          storage.getItem = () => {
            throw new Error(error)
          }
        },
      }
    },
  },
  {
    label: 'desktop',
    create() {
      const host = memoryHost()
      return {
        newPersistence: () => createPersistence(createDesktopAdapter(host.invoke)),
        read: () => (host.files.has('state') ? host.files.get('state') : null),
        seed: (raw) => host.files.set('state', raw),
        failWritesWith: host.failWritesWith,
        failReadsWith: host.failReadsWith,
      }
    },
  },
]

for (const { label, create } of implementations) {
  test(`${label}: the first start writes the initial document`, async () => {
    const backing = create()
    const started = await backing.newPersistence().load()
    assert.equal(started.error, null)
    assert.equal(started.blocked, false)
    assert.equal(started.document.notes.length, 1)
    assert.equal(JSON.parse(backing.read()).version, 3)
  })

  test(`${label}: notes, headings, trash and backup survive a restart`, async () => {
    const backing = create()
    const persistence = backing.newPersistence()
    const started = await persistence.load()
    const body = '# Plano\n\nlinha final\n'
    const note = {
      id: 'plano',
      name: nameFromHeading(body, started.document.notes, 'plano'),
      body,
      revision: 0,
    }
    assert.equal(note.name, 'Plano.md')
    const document = {
      ...started.document,
      notes: [...started.document.notes, note],
      openIds: [...started.document.openIds, note.id],
      activeId: note.id,
    }
    assert.equal(await persistence.save(document), null)

    const restarted = await backing.newPersistence().load()
    assert.equal(restarted.error, null)
    assert.deepEqual(restarted.document, document)
    assert.deepEqual(readBackup(createBackup(restarted.document)), document)

    const deleted = moveToTrash(restarted.document, 'plano', 1234)
    assert.equal(await persistence.save(deleted), null)
    const afterDelete = await backing.newPersistence().load()
    assert.equal(afterDelete.document.notes.length, 1)
    assert.equal(afterDelete.document.trash[0].note.body, body)

    const restored = restoreFromTrash(afterDelete.document, 'plano')
    assert.equal(restored.notes.find((item) => item.id === 'plano').body, body)
    assert.equal(purgeFromTrash(restored, 'plano').trash.length, 0)
  })

  test(`${label}: a corrupt payload blocks writes and stays available for recovery`, async () => {
    const backing = create()
    backing.seed('{bad')
    const loaded = await backing.newPersistence().load()
    assert.ok(loaded.error)
    assert.equal(loaded.blocked, true)
    assert.equal(loaded.raw, '{bad')
    assert.equal(backing.read(), '{bad')
  })

  test(`${label}: a read failure blocks writes without replacing the saved payload`, async () => {
    const backing = create()
    await backing.newPersistence().load()
    const previous = backing.read()
    backing.failReadsWith('read denied')
    const loaded = await backing.newPersistence().load()
    assert.match(loaded.error, /read denied/)
    assert.equal(loaded.blocked, true)
    assert.equal(loaded.raw, null)
    assert.equal(loaded.document.notes[0].body.includes('Listas'), true)
    assert.equal(backing.read(), previous)
  })

  test(`${label}: a failed write keeps the previous payload and reports the error`, async () => {
    const backing = create()
    const persistence = backing.newPersistence()
    const started = await persistence.load()
    const previous = backing.read()
    backing.failWritesWith('quota exceeded')
    const document = {
      ...started.document,
      preferences: { ...started.document.preferences, fontSize: 22 },
    }
    assert.match(await persistence.save(document), /quota exceeded/)
    assert.equal(backing.read(), previous)
    assert.equal(document.preferences.fontSize, 22)
  })

  test(`${label}: an invalid document never reaches the storage`, async () => {
    const backing = create()
    const persistence = backing.newPersistence()
    const started = await persistence.load()
    const previous = backing.read()
    assert.equal(
      await persistence.save({ ...started.document, activeId: 'missing' }),
      'Invalid active note',
    )
    assert.equal(backing.read(), previous)
  })
}
