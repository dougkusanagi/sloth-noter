import test from 'node:test'
import assert from 'node:assert/strict'
import { createPersistence } from './persistence.js'
import { connectVault, createVaultAdapter } from './persistence-vault.js'
import { createAppPersistence } from './persistence-runtime.js'
import { headingFileName, moveToTrash, restoreFromTrash, uniqueName } from './notes.js'
import { newDocument } from './storage.js'
import { openWorkspace } from './boot.js'
import { ensureTitle } from './title.js'

/** In-memory stand-in for the native commands, with the same refusal rules. */
function fakeHost({ files = {}, aux = null, chosen = '/notes', state = null } = {}) {
  const host = {
    files: new Map(Object.entries(files)),
    aux,
    state,
    chosen,
    vault: '/notes',
    calls: [],
  }
  host.invoke = async (command, args = {}) => {
    host.calls.push(command)
    if (command === 'vault_list')
      return [...host.files]
        .map(([name, contents]) => ({ name, contents }))
        .sort((a, b) => a.name.localeCompare(b.name))
    if (command === 'vault_stamps')
      return [...host.files].map(([name, contents]) => ({
        name,
        len: contents.length,
        modifiedMs: contents,
      }))
    if (command === 'vault_read_aux') return host.aux
    if (command === 'vault_write_aux') {
      host.aux = args.contents
      return null
    }
    if (command === 'read_state') return host.state
    if (command === 'vault_choose') return host.chosen
    if (command === 'vault_activate') {
      if (args.document) {
        const document = JSON.parse(args.document)
        for (const note of document.notes)
          if (host.files.has(note.name) && host.files.get(note.name) !== note.body)
            throw new Error('A different file already exists')
        for (const note of document.notes) host.files.set(note.name, note.body)
      }
      host.vault = host.chosen
      return null
    }
    if (command === 'vault_status')
      return { path: host.vault, available: host.vault !== null && !host.missing }
    if (command === 'vault_apply') {
      const { op } = args
      for (const name of op.kind === 'rename' ? [op.from, op.to] : [op.name])
        if (Buffer.byteLength(name, 'utf8') > 255) throw new Error('Invalid note filename')
      if (op.kind === 'write') {
        if (Buffer.byteLength(`.${op.name}.sloth-tmp`, 'utf8') > 255)
          throw new Error('Temporary filename is too long')
        const current = host.files.has(op.name) ? host.files.get(op.name) : null
        if (current !== op.expected) throw new Error(`'${op.name}' was changed outside Sloth Note`)
        host.files.set(op.name, op.contents)
      } else if (op.kind === 'rename') {
        if (host.files.has(op.to)) throw new Error(`'${op.to}' already exists`)
        host.files.set(op.to, host.files.get(op.from))
        host.files.delete(op.from)
      } else if (op.kind === 'remove') {
        if (host.files.has(op.name) && host.files.get(op.name) !== op.expected)
          throw new Error(`'${op.name}' was changed outside Sloth Note`)
        host.files.delete(op.name)
      }
      return null
    }
    throw new Error(`unexpected command ${command}`)
  }
  return host
}

const start = (host) => createPersistence(createVaultAdapter(host.invoke, '/notes'))

test('an empty new folder starts with the welcome note as a real file', async () => {
  const host = fakeHost()
  const loaded = await start(host).load()
  assert.equal(loaded.error, null)
  assert.equal(host.files.get('Welcome.md'), newDocument().notes[0].body)
})

test('the files are the notes and unicode, blank lines and unsupported text survive', async () => {
  const body = '# Olá 🦥\n\n\ntexto <b>cru</b>\n\n'
  const host = fakeHost({ files: { 'Olá.md': body, 'b.md': 'B' } })
  const loaded = await start(host).load()
  assert.deepEqual(
    loaded.document.notes.map((note) => note.body),
    ['B', body],
  )
  assert.equal(loaded.document.openIds.length, 1)
})

test('edits, new notes and renames reach the files; tabs survive a restart', async () => {
  const host = fakeHost({ files: { 'a.md': 'A' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  const [note] = document.notes
  const created = { id: 'n1', name: 'novo.md', body: 'novo', revision: 0 }
  const next = {
    ...document,
    notes: [{ ...note, name: 'renomeada.md', body: 'A editada' }, created],
    openIds: ['n1', note.id],
    pinnedIds: ['n1'],
    activeId: 'n1',
  }
  assert.equal(await persistence.save(next), null)
  assert.deepEqual(
    [...host.files],
    [
      ['renomeada.md', 'A editada'],
      ['novo.md', 'novo'],
    ],
  )
  const restarted = await start(host).load()
  assert.equal(restarted.document.activeId, 'n1')
  assert.deepEqual(restarted.document.openIds, next.openIds)
  assert.deepEqual(restarted.document.pinnedIds, next.pinnedIds)
  assert.equal(restarted.document.notes.length, 2)
})

test('importing long first lines saves the full text and survives a restart', async () => {
  const host = fakeHost({ files: { 'a.md': '# A' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  const body = ensureTitle(`${'Bem-vindo! A transição será tranquila. 🦥 '.repeat(15)}\n\nConteúdo`)
  const notes = [...document.notes]
  for (const id of ['imported-a', 'imported-b'])
    notes.push({ id, name: uniqueName(notes, headingFileName(body)), body, revision: 0 })
  const next = { ...document, notes, openIds: ['imported-a'], activeId: 'imported-a' }
  assert.equal(await persistence.save(next), null)
  for (const note of notes.slice(1)) assert.equal(host.files.get(note.name), body)
  const reopened = await openWorkspace(start(host))
  assert.equal(reopened.error, null)
  assert.deepEqual(
    reopened.document.notes
      .filter((note) => note.id.startsWith('imported'))
      .map((note) => note.name)
      .sort(),
    notes
      .slice(1)
      .map((note) => note.name)
      .sort(),
  )
  for (const note of reopened.document.notes.filter((note) => note.id.startsWith('imported')))
    assert.equal(note.body, body)
})

test('a deleted note leaves the folder but stays recoverable from the trash', async () => {
  const host = fakeHost({ files: { 'a.md': 'A', 'b.md': 'B' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  const target = document.notes[0]
  assert.equal(await persistence.save(moveToTrash(document, target.id, 1)), null)
  assert.deepEqual([...host.files.keys()], ['b.md'])
  const second = start(host)
  const reloaded = await second.load()
  assert.equal(reloaded.document.trash[0].note.body, 'A')
  const restored = restoreFromTrash(reloaded.document, target.id)
  assert.equal(await second.save(restored), null)
  assert.equal(host.files.get('a.md'), 'A')
})

test('a blank new note discarded on close does not block the next one', async () => {
  const host = fakeHost({ files: { 'a.md': 'A' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  const blank = { id: 'n1', name: 'new note.md', body: '# new note', revision: 0 }
  const open = { ...document, notes: [...document.notes, blank], openIds: ['n1'], activeId: 'n1' }
  assert.equal(await persistence.save(open), null)
  assert.ok(host.files.has('new note.md'))
  assert.equal(await persistence.save(document), null)
  assert.equal(host.files.has('new note.md'), false)
  assert.equal(await persistence.save(open), null)
})

test('an edit made outside the app is not overwritten and the text stays in memory', async () => {
  const host = fakeHost({ files: { 'a.md': 'A' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  host.files.set('a.md', 'edited elsewhere')
  const error = await persistence.save({
    ...document,
    notes: [{ ...document.notes[0], body: 'A + local' }],
  })
  assert.match(error, /outside Sloth Note/)
  assert.equal(host.files.get('a.md'), 'edited elsewhere')
})

test('swapping two names in one save does not deadlock or overwrite', async () => {
  const host = fakeHost({ files: { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  const [a, b] = document.notes
  // a -> d, b -> a in a single save: b must wait until a's old name is free.
  const error = await persistence.save({
    ...document,
    notes: [{ ...a, name: 'd.md' }, { ...b, name: 'a.md' }, document.notes[2]],
  })
  assert.equal(error, null)
  assert.deepEqual(Object.fromEntries(host.files), { 'd.md': 'A', 'a.md': 'B', 'c.md': 'C' })
})

test('opening repeated new-note headings keeps filenames and note identities stable', async () => {
  const host = fakeHost({
    files: { 'new note.md': '# new note\nfirst', 'new note (2).md': '# new note\nsecond' },
    aux: JSON.stringify({
      ids: { 'new note.md': 'a', 'new note (2).md': 'b' },
      openIds: ['a', 'b'],
      activeId: 'b',
    }),
  })
  const loaded = await openWorkspace(start(host))
  assert.equal(loaded.error, null)
  assert.equal(loaded.document.activeId, 'b')
  assert.equal(loaded.document.notes.find((note) => note.id === 'b').name, 'new note (2).md')
  assert.equal(host.calls.includes('vault_apply'), false)
})

test('rename cycles preserve every body and identity through a restart', async () => {
  for (const size of [2, 3]) {
    const host = fakeHost({ files: { 'a.md': 'A', 'b.md': 'B', 'c.md': 'C' } })
    const persistence = start(host)
    const { document } = await persistence.load()
    const next = {
      ...document,
      notes: document.notes.map((note, index) =>
        index < size
          ? { ...note, name: document.notes[(index + 1) % size].name, body: `${note.body} edited` }
          : note,
      ),
    }
    assert.equal(await persistence.save(next), null)
    assert.equal(host.files.size, 3)
    for (const note of next.notes) assert.equal(host.files.get(note.name), note.body)
    const restarted = await start(host).load()
    for (const note of next.notes)
      assert.deepEqual(
        restarted.document.notes.find((item) => item.id === note.id),
        note,
      )
  }
})

test('a rename cycle interrupted after staging can be retried without losing text', async () => {
  const host = fakeHost({ files: { 'a.md': 'A', 'b.md': 'B' } })
  const invoke = host.invoke
  let renames = 0
  host.invoke = async (command, args) => {
    if (command === 'vault_apply' && args.op.kind === 'rename' && ++renames === 2)
      throw new Error('disk unavailable')
    return invoke(command, args)
  }
  const persistence = start(host)
  const { document } = await persistence.load()
  const next = {
    ...document,
    notes: document.notes.map((note, index) => ({
      ...note,
      name: document.notes[1 - index].name,
      body: `${note.body} edited`,
    })),
  }
  assert.equal(await persistence.save(next), 'disk unavailable')
  assert.deepEqual([...host.files.values()].sort(), ['A', 'B'])
  assert.equal(await persistence.save(next), null)
  assert.deepEqual(Object.fromEntries(host.files), { 'a.md': 'B edited', 'b.md': 'A edited' })
})

test('rename cycles retain protection against edits made outside the app', async () => {
  const host = fakeHost({ files: { 'a.md': 'A', 'b.md': 'B' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  host.files.set('a.md', 'A external')
  const next = {
    ...document,
    notes: document.notes.map((note, index) => ({
      ...note,
      name: document.notes[1 - index].name,
      body: `${note.body} local`,
    })),
  }
  assert.match(await persistence.save(next), /outside Sloth Note/)
  assert.equal(host.files.get('b.md'), 'A external')
  assert.equal(host.files.get('a.md'), 'B')
  assert.equal(host.files.size, 2)
})

test('a rename never overwrites an unrelated file at its destination', async () => {
  const host = fakeHost({ files: { 'a.md': 'A', 'b.md': 'B' } })
  const persistence = start(host)
  const { document } = await persistence.load()
  const next = { ...document, notes: [{ ...document.notes[0], name: 'b.md' }] }
  assert.match(await persistence.save(next), /already exists|outside Sloth Note/)
  assert.deepEqual(Object.fromEntries(host.files), { 'a.md': 'A', 'b.md': 'B' })
})

test('the runtime picks the folder when one is connected and reports a missing one', async () => {
  const target = { __TAURI_INTERNALS__: { invoke: async () => null } }
  const connected = fakeHost()
  const withVault = await createAppPersistence(target, async () => ({ invoke: connected.invoke }))
  assert.equal(withVault.kind, 'vault')
  assert.equal(withVault.vault.path, '/notes')

  const missing = fakeHost()
  missing.missing = true
  const fallback = await createAppPersistence(target, async () => ({ invoke: missing.invoke }))
  assert.equal(fallback.kind, 'desktop')
  assert.deepEqual(fallback.vaultProblem, { path: '/notes' })
})

test('connecting an empty folder offers to copy the current notes, only once accepted', async () => {
  const state = JSON.stringify(newDocument())
  const declined = fakeHost({ state })
  assert.equal(await connectVault(declined.invoke, () => false), true)
  assert.equal(declined.files.size, 0)

  const accepted = fakeHost({ state })
  let asked = 0
  await connectVault(accepted.invoke, (count) => (asked = count) > 0)
  assert.equal(asked, 1)
  assert.equal(accepted.files.get('Welcome.md'), newDocument().notes[0].body)
})

test('opening an existing folder keeps its notes without copying', async () => {
  const host = fakeHost({ files: { 'x.md': 'X' }, state: JSON.stringify(newDocument()) })
  let asked = false
  await connectVault(host.invoke, async () => {
    asked = true
    return false
  })
  assert.equal(asked, true)
  assert.deepEqual([...host.files.keys()], ['x.md'])
})

test('cancelling the folder dialog changes nothing', async () => {
  const host = fakeHost({ chosen: null })
  assert.equal(await connectVault(host.invoke, () => true), false)
  assert.equal(host.calls.includes('vault_list'), false)
})

async function opened(files) {
  const host = fakeHost({ files })
  const adapter = createVaultAdapter(host.invoke, '/notes')
  const persistence = createPersistence(adapter)
  const { document } = await persistence.load()
  const refresh = async (current) => {
    const scanned = await persistence.sync.scan()
    return scanned === null ? null : persistence.sync.merge(current, scanned)
  }
  return { host, persistence, document, refresh }
}

test('an unchanged folder is not read again', async () => {
  const { refresh, document } = await opened({ 'a.md': 'A' })
  assert.notEqual(await refresh(document), null)
  assert.equal(await refresh(document), null)
})

test('outside edits to untouched notes and new files are imported', async () => {
  const { host, refresh, document } = await opened({ 'a.md': 'A' })
  host.files.set('a.md', 'A editada fora')
  host.files.set('nova.md', 'criada fora')
  const result = await refresh(document)
  assert.equal(result.changed, true)
  assert.deepEqual(result.conflicts, [])
  assert.deepEqual(
    result.document.notes.map((note) => [note.name, note.body]),
    [
      ['a.md', 'A editada fora'],
      ['nova.md', 'criada fora'],
    ],
  )
  assert.equal(result.document.notes[0].revision, 1)
})

test('a note deleted outside is dropped when untouched and reported when edited here', async () => {
  const { host, refresh, document } = await opened({ 'a.md': 'A', 'b.md': 'B' })
  host.files.delete('a.md')
  const dropped = await refresh(document)
  assert.deepEqual(
    dropped.document.notes.map((note) => note.name),
    ['b.md'],
  )
  assert.equal(dropped.document.openIds.includes(document.notes[0].id), false)

  const second = await opened({ 'a.md': 'A' })
  const edited = {
    ...second.document,
    notes: [{ ...second.document.notes[0], body: 'A local' }],
  }
  second.host.files.delete('a.md')
  const result = await second.refresh(edited)
  assert.deepEqual(result.conflicts, [{ id: edited.notes[0].id, name: 'a.md', kind: 'deleted' }])
  assert.equal(result.document.notes.length, 1)
})

test('our own writes never look like outside changes', async () => {
  const { persistence, refresh, document } = await opened({ 'a.md': 'A' })
  const saved = { ...document, notes: [{ ...document.notes[0], body: 'A + local' }] }
  assert.equal(await persistence.save(saved), null)
  const result = await refresh(saved)
  assert.equal(result.changed, false)
  assert.deepEqual(result.conflicts, [])
})

test('when both sides changed nothing is overwritten until the user decides', async () => {
  for (const choice of ['mine', 'external', 'both']) {
    const { host, persistence, document, refresh } = await opened({ 'a.md': 'A' })
    const local = { ...document, notes: [{ ...document.notes[0], body: 'A local' }] }
    host.files.set('a.md', 'A disk')
    const { conflicts } = await refresh(local)
    assert.equal(conflicts.length, 1)
    assert.equal(conflicts[0].kind, 'changed')
    assert.match(await persistence.save(local), /outside Sloth Note/)
    assert.equal(host.files.get('a.md'), 'A disk')

    const resolved = persistence.sync.resolve(local, conflicts[0], choice)
    assert.equal(await persistence.save(resolved), null)
    if (choice === 'mine') assert.deepEqual([...host.files], [['a.md', 'A local']])
    if (choice === 'external') assert.deepEqual([...host.files], [['a.md', 'A disk']])
    if (choice === 'both')
      assert.deepEqual(Object.fromEntries(host.files), {
        'a.md': 'A local',
        'a (disk).md': 'A disk',
      })
  }
})

test('deleting outside while editing here can keep the local text', async () => {
  const { host, persistence, document, refresh } = await opened({ 'a.md': 'A' })
  const local = { ...document, notes: [{ ...document.notes[0], body: 'A local' }] }
  host.files.delete('a.md')
  const { conflicts } = await refresh(local)
  const resolved = persistence.sync.resolve(local, conflicts[0], 'mine')
  assert.equal(await persistence.save(resolved), null)
  assert.equal(host.files.get('a.md'), 'A local')
})

test('restoring a backup replaces same-named files and never deletes the others', async () => {
  const { host, persistence, document } = await opened({ 'a.md': 'A', 'b.md': 'B' })
  const backup = {
    ...document,
    notes: [{ id: 'from-backup', name: 'a.md', body: 'A do backup', revision: 0 }],
    openIds: ['from-backup'],
    activeId: 'from-backup',
  }
  assert.equal(await persistence.save(backup), null)
  assert.deepEqual(Object.fromEntries(host.files), { 'a.md': 'A do backup', 'b.md': 'B' })
})

test('an asynchronous decline is awaited before activation', async () => {
  const host = fakeHost({ state: JSON.stringify(newDocument()) })
  await connectVault(host.invoke, async () => {
    await Promise.resolve()
    return false
  })
  assert.equal(host.files.size, 0)
  assert.equal(host.calls.at(-1), 'vault_activate')
})
test('copying uses the current workspace and retains the old folder on conflict', async () => {
  const document = newDocument()
  document.notes[0].body = 'Latest text from the current vault'
  const host = fakeHost({ files: { 'Welcome.md': 'Existing text' }, chosen: '/new' })
  await assert.rejects(
    connectVault(host.invoke, async () => true, document),
    /different file/,
  )
  assert.equal(host.vault, '/notes')
  assert.equal(host.files.get('Welcome.md'), 'Existing text')
})

test('cancelling the copy choice leaves the active folder untouched', async () => {
  const host = fakeHost({ chosen: '/new', state: JSON.stringify(newDocument()) })
  assert.equal(await connectVault(host.invoke, async () => null), false)
  assert.equal(host.vault, '/notes')
  assert.equal(host.calls.includes('vault_activate'), false)
})
