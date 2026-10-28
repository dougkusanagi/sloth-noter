import test from 'node:test'
import assert from 'node:assert/strict'
import { createDesktopAdapter } from './persistence-desktop.js'
import { createPersistence } from './persistence.js'
import {
  checkExternalNotes,
  externalNote,
  readExternalNotes,
  writeExternalNotes,
} from './external-notes.js'
import { newDocument } from './storage.js'

/** A fake native side: a map of path -> text, with the same expected-text guard as Rust. */
function disk(files = {}) {
  const store = new Map(Object.entries(files))
  const calls = []
  const invoke = async (command, args = {}) => {
    calls.push(command)
    if (command === 'external_read') {
      if (!store.has(args.path)) throw new Error('not found')
      return store.get(args.path)
    }
    if (command === 'external_write') {
      if (store.get(args.path) !== args.expected) throw new Error('changed outside Sloth Note')
      store.set(args.path, args.contents)
      return undefined
    }
    throw new Error(`unexpected ${command}`)
  }
  return { store, calls, invoke }
}

const note = (id, path, contents, body = contents) => ({
  ...externalNote({ id, name: `${id}.md`, path, contents }),
  body,
})

test('an edited external note is written back with the text it was read with', async () => {
  const host = disk({ '/notas/a.md': '# A' })
  const seen = new Map()
  const doc = {
    ...newDocument(),
    notes: [note('a', '/notas/a.md', '# A', '# A\n\nmais')],
    trash: [],
  }
  await writeExternalNotes(host.invoke, doc, seen)
  assert.equal(host.store.get('/notas/a.md'), '# A\n\nmais')
  assert.equal(seen.get('a'), '# A\n\nmais')
  await writeExternalNotes(host.invoke, doc, seen)
  assert.equal(host.calls.filter((call) => call === 'external_write').length, 1)
})

test('a file changed outside the app is not overwritten and keeps the local text', async () => {
  const host = disk({ '/notas/a.md': '# editado fora' })
  const seen = new Map()
  const doc = { ...newDocument(), notes: [note('a', '/notas/a.md', '# A', '# A local')], trash: [] }
  await assert.rejects(writeExternalNotes(host.invoke, doc, seen), /changed outside/)
  assert.equal(host.store.get('/notas/a.md'), '# editado fora')
  // Nothing was recorded, so the next attempt still compares against the text read from disk.
  assert.equal(seen.get('a') ?? doc.notes[0].external.seen, '# A')
})

test('removing an external note from the document never touches its file', async () => {
  const host = disk({ '/notas/a.md': '# A' })
  const seen = new Map([['a', '# A']])
  await writeExternalNotes(host.invoke, { ...newDocument(), notes: [], trash: [] }, seen)
  assert.equal(host.store.get('/notas/a.md'), '# A')
  assert.equal(seen.size, 0)
})

test('a trashed external note keeps tracking its file until purged', async () => {
  const host = disk({ '/notas/a.md': '# A' })
  const seen = new Map([['a', '# A']])
  const trashed = note('a', '/notas/a.md', '# A', '# A edit')
  await writeExternalNotes(
    host.invoke,
    { ...newDocument(), notes: [], trash: [{ note: trashed }] },
    seen,
  )
  assert.equal(seen.has('a'), true)
  // The trashed text is written too, so the file matches the note if it is restored.
  assert.equal(host.store.get('/notas/a.md'), '# A edit')
})

test('loading brings in outside edits, and a missing file keeps the stored text', async () => {
  const host = disk({ '/notas/a.md': '# novo', '/notas/b.md': '# B' })
  const seen = new Map()
  const notes = await readExternalNotes(
    host.invoke,
    [note('a', '/notas/a.md', '# antigo'), note('b', '/notas/gone.md', '# guardado')],
    seen,
  )
  assert.equal(notes[0].body, '# novo')
  assert.equal(notes[0].external.seen, '# novo')
  assert.equal(notes[1].body, '# guardado')
  assert.equal(seen.get('a'), '# novo')
  assert.equal(seen.get('b'), '# guardado')
})

test('the desktop state round-trips external notes through their files', async () => {
  const host = disk({ '/notas/ideias.md': '# Ideias' })
  const state = new Map()
  const invoke = async (command, args) => {
    if (command === 'read_state') return state.get('state') ?? null
    if (command === 'write_state') return state.set('state', args.contents)
    return host.invoke(command, args)
  }
  const persistence = createPersistence(createDesktopAdapter(invoke))
  const opened = {
    ...newDocument(),
    notes: [note('i', '/notas/ideias.md', '# Ideias')],
    openIds: ['i'],
    activeId: 'i',
  }
  assert.equal(await persistence.save(opened), null)

  // Edited in the app, then saved: the file follows.
  const edited = {
    ...opened,
    notes: opened.notes.map((item) => ({ ...item, body: '# Ideias\n\nnova linha' })),
  }
  assert.equal(await persistence.save(edited), null)
  assert.equal(host.store.get('/notas/ideias.md'), '# Ideias\n\nnova linha')

  // Edited outside while the app was closed: loading shows the file's text.
  host.store.set('/notas/ideias.md', '# Ideias\n\nedição externa')
  const loaded = await createPersistence(createDesktopAdapter(invoke)).load()
  assert.equal(loaded.document.notes[0].body, '# Ideias\n\nedição externa')
})

test('an untouched external note follows the file and an edited one is reported as a conflict', async () => {
  const host = disk({ '/n/a.md': '# A novo', '/n/b.md': '# B novo' })
  const seen = new Map()
  const doc = {
    ...newDocument(),
    notes: [note('a', '/n/a.md', '# A'), note('b', '/n/b.md', '# B', '# B local')],
    trash: [],
  }
  const result = await checkExternalNotes(host.invoke, doc, seen)
  assert.equal(result.document.notes[0].body, '# A novo')
  assert.equal(result.document.notes[0].revision, 1)
  assert.equal(result.document.notes[1].body, '# B local')
  assert.deepEqual(result.conflicts, [{ id: 'b', name: 'b.md', disk: '# B novo' }])
  const same = await checkExternalNotes(host.invoke, result.document, seen)
  assert.equal(same.document, result.document)
})

test('purging an external note releases its file but trashing it does not', async () => {
  const released = []
  const invoke = async (command, args) => {
    if (command === 'external_release') released.push(args.path)
  }
  const seen = new Map()
  const paths = new Map()
  const a = note('a', '/n/a.md', '# A')
  const trashed = { ...newDocument(), notes: [], trash: [{ note: a, deletedAt: 1 }] }
  await writeExternalNotes(invoke, { ...newDocument(), notes: [a], trash: [] }, seen, paths)
  await writeExternalNotes(invoke, trashed, seen, paths)
  assert.deepEqual(released, [])
  await writeExternalNotes(invoke, { ...newDocument(), notes: [], trash: [] }, seen, paths)
  assert.deepEqual(released, ['/n/a.md'])
})

function localHost(files = {}) {
  const host = disk(files)
  let state = null
  let unavailable = false
  return {
    ...host,
    get state() {
      return JSON.parse(state)
    },
    set unavailable(value) {
      unavailable = value
    },
    invoke: async (command, args) => {
      if (command === 'read_state') return state
      if (command === 'write_state') {
        if (unavailable) throw '[disk-full] full'
        state = args.contents
        return null
      }
      return host.invoke(command, args)
    },
  }
}

test('an unavailable external file does not block local notes or other external files', async () => {
  const host = localHost({ '/n/ok.md': 'original' })
  const persistence = createPersistence(createDesktopAdapter(host.invoke))
  const document = newDocument()
  document.notes[0].body = '# Texto local novo'
  document.notes.push(note('missing', '/n/missing.md', 'original', 'pendente'))
  document.notes.push(note('ok', '/n/ok.md', 'original', 'salvo no arquivo'))
  const error = await persistence.save(document)
  assert.match(error, /missing.md/)
  assert.match(error, /\/n\/missing.md/)
  assert.equal(persistence.saveIssue.localSaved, true)
  assert.equal(host.state.notes[0].body, '# Texto local novo')
  assert.equal(host.state.notes[1].body, 'pendente')
  assert.equal(host.state.notes[1].external.seen, 'original')
  assert.equal(host.state.notes[2].external.seen, 'salvo no arquivo')
  assert.equal(host.store.get('/n/ok.md'), 'salvo no arquivo')
  const reopened = createPersistence(createDesktopAdapter(host.invoke))
  const loaded = await reopened.load()
  assert.equal(loaded.document.notes[1].body, 'pendente')
  assert.match(loaded.error, /\/n\/missing.md/)
  host.store.set('/n/missing.md', 'original')
  assert.equal(await reopened.save(loaded.document), null)
  assert.equal(host.store.get('/n/missing.md'), 'pendente')
  assert.equal(reopened.saveIssue, null)
})

test('reopening a pending edit preserves both sides of an external conflict', async () => {
  const host = localHost({ '/n/a.md': 'texto externo' })
  const persistence = createPersistence(createDesktopAdapter(host.invoke))
  const document = newDocument()
  document.notes.push(note('a', '/n/a.md', 'original', 'texto local'))
  assert.match(await persistence.save(document), /\/n\/a.md/)
  const reopened = createPersistence(createDesktopAdapter(host.invoke))
  const loaded = await reopened.load()
  assert.equal(loaded.document.notes.at(-1).body, 'texto local')
  assert.equal(host.store.get('/n/a.md'), 'texto externo')
  const checked = await reopened.externals.check(loaded.document)
  assert.equal(checked.conflicts[0].disk, 'texto externo')
  assert.match(await reopened.save(loaded.document), /\/n\/a.md/)
  assert.equal(host.store.get('/n/a.md'), 'texto externo')
})

test('a failed local snapshot prevents external writes and never claims local recovery', async () => {
  const host = localHost({ '/n/a.md': 'original' })
  host.unavailable = true
  const persistence = createPersistence(createDesktopAdapter(host.invoke))
  const document = newDocument()
  document.notes.push(note('a', '/n/a.md', 'original', 'texto local'))
  assert.ok(await persistence.save(document))
  assert.equal(persistence.saveIssue, null)
  assert.equal(host.calls.includes('external_write'), false)
  assert.equal(host.store.get('/n/a.md'), 'original')
})

test('a successful external write is not repeated after reopening', async () => {
  const host = localHost({ '/n/a.md': 'original' })
  const document = newDocument()
  document.notes.push(note('a', '/n/a.md', 'original', 'novo'))
  assert.equal(await createPersistence(createDesktopAdapter(host.invoke)).save(document), null)
  const reopened = createPersistence(createDesktopAdapter(host.invoke))
  const loaded = await reopened.load()
  assert.equal(await reopened.save(loaded.document), null)
  assert.equal(host.calls.filter((call) => call === 'external_write').length, 1)
})

test('an invalid saved document stays available for recovery', async () => {
  const raw = JSON.stringify({ version: 3, notes: [] })
  const persistence = createPersistence(createDesktopAdapter(async () => raw))
  const loaded = await persistence.load()
  assert.equal(loaded.blocked, true)
  assert.equal(loaded.raw, raw)
})

test('a failed external write still releases its registration when removed', async () => {
  const released = []
  const invoke = async (command, args) => {
    if (command === 'external_write') throw '[not-found] missing'
    if (command === 'external_release') released.push(args.path)
  }
  const seen = new Map()
  const paths = new Map()
  const document = newDocument()
  document.notes.push(note('a', '/n/a.md', 'original', 'pending'))
  await writeExternalNotes(invoke, document, seen, paths, { continueOnError: true })
  await writeExternalNotes(invoke, newDocument(), seen, paths)
  assert.deepEqual(released, ['/n/a.md'])
})

test('failure to confirm a disk write in the snapshot is recoverable on restart', async () => {
  const host = localHost({ '/n/a.md': 'original' })
  let writes = 0
  const invoke = async (command, args) => {
    if (command === 'write_state' && ++writes === 2) throw '[disk-full] full'
    return host.invoke(command, args)
  }
  const document = newDocument()
  document.notes.push(note('a', '/n/a.md', 'original', 'novo'))
  assert.ok(await createPersistence(createDesktopAdapter(invoke)).save(document))
  assert.equal(host.state.notes.at(-1).external.seen, 'original')
  assert.equal(host.store.get('/n/a.md'), 'novo')
  const reopened = createPersistence(createDesktopAdapter(host.invoke))
  const loaded = await reopened.load()
  assert.equal(loaded.error, null)
  assert.equal(loaded.document.notes.at(-1).external.seen, 'novo')
  assert.equal(await reopened.save(loaded.document), null)
  assert.equal(host.calls.filter((call) => call === 'external_write').length, 1)
})

test('pending edits in the trash survive restart and a later validation failure clears the saved claim', async () => {
  const host = localHost()
  const persistence = createPersistence(createDesktopAdapter(host.invoke))
  const document = newDocument()
  document.trash.push({
    note: note('a', '/n/missing.md', 'original', 'pendente na lixeira'),
    deletedAt: 1,
    index: 0,
  })
  assert.ok(await persistence.save(document))
  assert.equal(persistence.saveIssue.localSaved, true)
  const loaded = await createPersistence(createDesktopAdapter(host.invoke)).load()
  assert.equal(loaded.document.trash[0].note.body, 'pendente na lixeira')
  assert.match(loaded.error, /\/n\/missing.md/)
  assert.ok(await persistence.save({ ...document, activeId: 'unknown' }))
  assert.equal(persistence.saveIssue, null)
})
