import test from 'node:test'
import assert from 'node:assert/strict'
import { createPersistence } from './persistence.js'
import { connectVault, createVaultAdapter } from './persistence-vault.js'
import { createAppPersistence } from './persistence-runtime.js'
import { moveToTrash, restoreFromTrash } from './notes.js'
import { newDocument } from './storage.js'

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
    if (command === 'vault_read_aux') return host.aux
    if (command === 'vault_write_aux') {
      host.aux = args.contents
      return null
    }
    if (command === 'read_state') return host.state
    if (command === 'vault_choose') return host.chosen
    if (command === 'vault_status')
      return { path: host.vault, available: host.vault !== null && !host.missing }
    if (command === 'vault_apply') {
      const { op } = args
      if (op.kind === 'write') {
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
    openIds: [note.id, 'n1'],
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
  assert.equal(restarted.document.openIds.length, 2)
  assert.equal(restarted.document.notes.length, 2)
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
  assert.match(fallback.vaultProblem, /not found: \/notes/)
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

test('connecting a folder that already has notes never copies over them', async () => {
  const host = fakeHost({ files: { 'x.md': 'X' }, state: JSON.stringify(newDocument()) })
  let asked = false
  await connectVault(host.invoke, () => (asked = true))
  assert.equal(asked, false)
  assert.deepEqual([...host.files.keys()], ['x.md'])
})

test('cancelling the folder dialog changes nothing', async () => {
  const host = fakeHost({ chosen: null })
  assert.equal(await connectVault(host.invoke, () => true), false)
  assert.equal(host.calls.includes('vault_list'), false)
})
