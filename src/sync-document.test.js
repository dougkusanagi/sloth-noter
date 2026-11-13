import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/api.js'
import { memoryStore } from '../server/memory-store.js'
import { createClient } from './sync/client.js'
import { runSync } from './sync/engine.js'
import { generateKeyBytes } from './sync/crypto.js'
import { applySync, localNotes, syncState } from './sync/document.js'
import { newDocument, validateDocument } from './storage.js'

const TOKEN = 't'.repeat(40)
const SERVER = 'http://localhost:8787'
const labels = { conflict: 'Conflito', end: 'Fim', ours: 'Este aparelho', theirs: 'Outro' }

function setup() {
  const api = createApi({ store: memoryStore(), token: TOKEN })
  return createClient({
    server: SERVER,
    token: TOKEN,
    fetch: async (url, init) => api(new Request(url, init)),
  })
}

const doc = (notes, extra = {}) => ({
  ...newDocument(),
  notes: notes.map((note) => ({ revision: 0, ...note })),
  openIds: notes.length ? [notes[0].id] : [],
  activeId: notes[0]?.id ?? null,
  ...extra,
})

async function sync(client, key, document, { edit } = {}) {
  const snapshot = localNotes(document)
  const before = syncState(document, SERVER)
  const result = await runSync({ client, key, local: snapshot, state: before, labels })
  // `edit` simulates typing while the network call was running.
  const latest = edit ? edit(document) : document
  const next = applySync(latest, { server: SERVER, snapshot, before, result, now: 1 })
  validateDocument(next)
  return next
}

test('notes, trash and groups arrive in a valid document', async () => {
  const client = setup()
  const key = generateKeyBytes()
  let desktop = doc([
    { id: 'a', name: 'A', body: '# A', group: 'Trabalho' },
    { id: 'b', name: 'B', body: '# B' },
  ])
  desktop = { ...desktop, groups: ['Trabalho'] }
  desktop = {
    ...desktop,
    notes: desktop.notes.filter((note) => note.id !== 'b'),
    trash: [{ note: desktop.notes[1], index: 1, deletedAt: 5 }],
  }
  await sync(client, key, desktop)
  let phone = await sync(client, key, doc([]))
  assert.deepEqual(
    phone.notes.map((n) => [n.id, n.group]),
    [['a', 'Trabalho']],
  )
  assert.deepEqual(phone.groups, ['Trabalho'])
  assert.deepEqual(
    phone.trash.map((e) => e.note.id),
    ['b'],
  )
  assert.equal(phone.sync.server, SERVER)
  assert.deepEqual(phone.openIds, ['a'])
})

test('files opened in place are not sent', async () => {
  const client = setup()
  const key = generateKeyBytes()
  const desktop = doc([
    { id: 'a', name: 'A', body: 'x' },
    { id: 'e', name: 'E', body: 'externo', external: { path: '/tmp/e.md' } },
  ])
  assert.deepEqual(
    localNotes(desktop).map((n) => n.id),
    ['a'],
  )
  await sync(client, key, desktop)
  assert.deepEqual(
    (await client.changes(null)).changes.map((c) => c.id),
    ['a'],
  )
})

test('typing during a sync is kept and the remote edit is merged on the next run', async () => {
  const client = setup()
  const key = generateKeyBytes()
  let desktop = await sync(client, key, doc([{ id: 'a', name: 'A', body: 'um\ndois\ntrês' }]))
  let phone = await sync(client, key, doc([]))
  phone = {
    ...phone,
    notes: phone.notes.map((n) => ({ ...n, body: 'UM\ndois\ntrês' })),
  }
  phone = await sync(client, key, phone)

  // The desktop types the last line while its sync fetches the phone's edit.
  desktop = await sync(client, key, desktop, {
    edit: (d) => ({ ...d, notes: d.notes.map((n) => ({ ...n, body: 'um\ndois\nTRÊS' })) }),
  })
  assert.equal(desktop.notes[0].body, 'um\ndois\nTRÊS', 'the typed text is not replaced')
  desktop = await sync(client, key, desktop)
  assert.equal(desktop.notes[0].body, 'UM\ndois\nTRÊS')
  phone = await sync(client, key, phone)
  assert.equal(phone.notes[0].body, 'UM\ndois\nTRÊS')
})

test('changing the server starts from an empty state', () => {
  const document = {
    ...doc([]),
    sync: { server: SERVER, cursor: 'c9', bases: { a: {} }, blobs: {} },
  }
  assert.equal(syncState(document, SERVER).cursor, 'c9')
  assert.deepEqual(syncState(document, 'https://outro.example'), {
    cursor: null,
    bases: {},
    blobs: {},
  })
})
