import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createApi } from '../server/api.js'
import { memoryStore } from '../server/memory-store.js'
import { createClient } from './sync/client.js'
import { emptyState, previewFirstSync, runSync } from './sync/engine.js'
import { generateKeyBytes } from './sync/crypto.js'

const TOKEN = 't'.repeat(40)
const labels = { conflict: 'Conflito', end: 'Fim do conflito', ours: 'Desktop', theirs: 'Celular' }

function server() {
  const api = createApi({ store: memoryStore(), token: TOKEN })
  const state = { down: false, calls: 0 }
  const fetch = async (url, init) => {
    state.calls++
    if (state.down) throw new TypeError('network')
    return api(new Request(url, init))
  }
  return { fetch, state }
}

// A device keeps its notes and sync state the way the app will: both saved together.
function device(remote, key, notes = {}) {
  const client = createClient({
    server: 'http://localhost:8787',
    token: TOKEN,
    fetch: remote.fetch,
  })
  const self = {
    notes: new Map(Object.entries(notes)),
    state: emptyState(),
    async sync(extra = {}) {
      const local = [...self.notes].map(([id, payload]) => ({ id, payload }))
      const out = await runSync({ client, key, local, state: self.state, labels, ...extra })
      for (const id of out.apply.remove) self.notes.delete(id)
      for (const { id, payload } of out.apply.upsert) self.notes.set(id, payload)
      self.state = out.state
      return out
    },
    client,
  }
  return self
}

const note = (body, name = 'Nota') => ({ name, body, trashed: false })

test('notes travel both ways and a second run sends nothing', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const desktop = device(remote, key, { a: note('do desktop', 'A') })
  const phone = device(remote, key, { b: note('do celular', 'B') })
  assert.equal((await desktop.sync()).error, undefined)
  await phone.sync()
  await desktop.sync()
  assert.deepEqual([...desktop.notes.keys()].sort(), ['a', 'b'])
  assert.deepEqual(desktop.notes.get('b'), note('do celular', 'B'))
  assert.deepEqual(phone.notes.get('a'), note('do desktop', 'A'))
  const before = remote.state.calls
  await desktop.sync()
  assert.equal(remote.state.calls - before, 1, 'only the change feed is read')
})

test('edits on different lines merge; the same line keeps both versions', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const desktop = device(remote, key, { a: note('um\ndois\ntrês') })
  const phone = device(remote, key)
  await desktop.sync()
  await phone.sync()
  desktop.notes.set('a', note('UM\ndois\ntrês'))
  phone.notes.set('a', note('um\ndois\nTRÊS'))
  await desktop.sync()
  await phone.sync()
  await desktop.sync()
  assert.equal(phone.notes.get('a').body, 'UM\ndois\nTRÊS')
  assert.equal(desktop.notes.get('a').body, 'UM\ndois\nTRÊS')

  desktop.notes.set('a', note('UM\nnosso\nTRÊS'))
  phone.notes.set('a', note('UM\ndeles\nTRÊS'))
  await desktop.sync()
  const out = await phone.sync()
  assert.deepEqual(out.conflicts, ['a'])
  const body = phone.notes.get('a').body
  assert.match(body, /Conflito — Desktop:\*\*\ndeles/)
  assert.match(body, /Conflito — Celular:\*\*\nnosso/)
  await desktop.sync()
  assert.equal(desktop.notes.get('a').body, body)
})

test('deletion reaches the other side; restore from trash travels too', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const desktop = device(remote, key, { a: note('x'), b: note('y', 'B') })
  const phone = device(remote, key)
  await desktop.sync()
  await phone.sync()
  desktop.notes.set('b', { ...note('y', 'B'), trashed: true })
  desktop.notes.delete('a')
  await desktop.sync()
  await phone.sync()
  assert.equal(phone.notes.has('a'), false)
  assert.equal(phone.notes.get('b').trashed, true)
  phone.notes.set('b', note('y', 'B'))
  await phone.sync()
  await desktop.sync()
  assert.equal(desktop.notes.get('b').trashed, false)
})

test('edited here and deleted there: the text survives as a new note', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const desktop = device(remote, key, { a: note('original') })
  const phone = device(remote, key)
  await desktop.sync()
  await phone.sync()
  desktop.notes.delete('a')
  await desktop.sync()
  phone.notes.set('a', note('editado no celular'))
  const out = await phone.sync({ newId: () => 'copia' })
  assert.deepEqual(out.conflicts, ['copia'])
  assert.equal(phone.notes.has('a'), false)
  assert.equal(phone.notes.get('copia').body, 'editado no celular')
  await desktop.sync()
  assert.equal(desktop.notes.get('copia').body, 'editado no celular')
})

test('network failure never touches local text and the next run recovers', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const desktop = device(remote, key, { a: note('local') })
  remote.state.down = true
  const out = await desktop.sync()
  assert.equal(out.error, 'offline')
  assert.deepEqual(desktop.notes.get('a'), note('local'))
  assert.deepEqual(out.apply, { upsert: [], remove: [] })
  remote.state.down = false
  assert.equal((await desktop.sync()).error, undefined)
  const phone = device(remote, key)
  await phone.sync()
  assert.deepEqual(phone.notes.get('a'), note('local'))
})

test('a lost answer after the server saved is not sent twice', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const desktop = device(remote, key, { a: note('v1') })
  await desktop.sync()
  // The PUT reaches the server, but the answer is lost.
  const original = remote.fetch
  let drop = true
  const flaky = async (url, init) => {
    const response = await original(url, init)
    if (init?.method === 'PUT' && drop) {
      drop = false
      throw new TypeError('timeout')
    }
    return response
  }
  const lossy = device({ fetch: flaky, state: remote.state }, key)
  lossy.notes = desktop.notes
  lossy.state = desktop.state
  lossy.notes.set('a', note('v2'))
  assert.equal((await lossy.sync()).error, 'offline')
  const out = await lossy.sync()
  assert.equal(out.error, undefined)
  assert.equal(lossy.notes.get('a').body, 'v2')
  assert.equal((await lossy.client.getNote('a')).revision, 2)
})

test('a wrong key fails without changing anything', async () => {
  const remote = server()
  const desktop = device(remote, generateKeyBytes(), { a: note('segredo') })
  await desktop.sync()
  const other = device(remote, generateKeyBytes(), { b: note('meu') })
  const out = await other.sync()
  assert.equal(out.error, 'wrong_key')
  assert.deepEqual([...other.notes.keys()], ['b'])
  assert.deepEqual(out.state.bases, {})
})

test('first sync preview counts without sending anything', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const desktop = device(remote, key, { a: note('x', 'Compras'), b: note('y', 'Ideias') })
  await desktop.sync()
  const phone = device(remote, key, { c: note('z', 'Compras') })
  const before = remote.state.calls
  const preview = await previewFirstSync({
    client: phone.client,
    key,
    local: [{ id: 'c', payload: phone.notes.get('c') }],
  })
  assert.deepEqual(preview, { download: 2, upload: 1, sameName: ['Compras'] })
  assert.ok(remote.state.calls > before)
  assert.equal((await phone.client.changes(null)).changes.length, 2)
})

test('the client refuses plain http to a remote host and never follows redirects', async () => {
  assert.throws(() => createClient({ server: 'http://example.com', token: TOKEN }))
  const client = createClient({
    server: 'https://sync.test',
    token: TOKEN,
    fetch: async () => new Response(null, { status: 302, headers: { location: 'https://x' } }),
  })
  await assert.rejects(client.changes(null), { code: 'redirect' })
  const limited = createClient({
    server: 'https://sync.test',
    token: TOKEN,
    fetch: async () => new Response('{}', { status: 429, headers: { 'retry-after': '7' } }),
  })
  await assert.rejects(limited.changes(null), { code: 'rate_limited', retryAfter: 7 })
})

function imageFolder(files = {}) {
  const map = new Map(Object.entries(files))
  return {
    map,
    read: async (src) => map.get(src) ?? null,
    write: async (src, bytes) => map.set(src, bytes),
  }
}

test('images go up before the note and arrive verified on the other side', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const photo = new Uint8Array([137, 80, 78, 71, 9, 9])
  const phoneFiles = imageFolder({ 'assets/abc-foto.png': photo })
  const desktopFiles = imageFolder()
  const phone = device(remote, key, {
    a: note(
      '![Foto](assets/abc-foto.png)\n<img src="./assets/abc-foto.png">\n![web](https://x/y.png)',
    ),
  })
  const desktop = device(remote, key)
  await phone.sync({ images: phoneFiles })
  assert.deepEqual(Object.keys(phone.state.blobs), ['assets/abc-foto.png'])
  const sha = phone.state.blobs['assets/abc-foto.png']
  assert.ok(await phone.client.getBlob(sha), 'blob stored before the revision')
  await desktop.sync({ images: desktopFiles })
  assert.deepEqual(desktopFiles.map.get('assets/abc-foto.png'), photo)
  assert.equal(desktop.state.blobs['assets/abc-foto.png'], sha)

  // Editing the note again reuses the same envelope instead of encrypting the image again.
  phone.notes.set('a', note(`${phone.notes.get('a').body}\nmais texto`))
  await phone.sync({ images: phoneFiles })
  assert.equal(phone.state.blobs['assets/abc-foto.png'], sha)
})

test('a note whose image is missing on the server is not applied', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const phone = device(remote, key, { a: note('![F](assets/f.png)') })
  await phone.sync({ images: imageFolder({ 'assets/f.png': new Uint8Array([1]) }) })
  const desktop = device(remote, key)
  const broken = {
    ...remote,
    fetch: async (url, init) =>
      String(url).includes('/v1/blobs/')
        ? new Response('{}', { status: 404 })
        : remote.fetch(url, init),
  }
  const lost = device(broken, key)
  const out = await lost.sync({ images: imageFolder() })
  assert.equal(out.error, 'missing_image')
  assert.equal(lost.notes.size, 0)
  assert.equal(out.state.cursor, null)
  await desktop.sync({ images: imageFolder() })
  assert.equal(desktop.notes.size, 1)
})

test('a manifest path outside assets is refused', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const evil = device(remote, key)
  const { encryptNote } = await import('./sync/crypto.js')
  const sealed = await encryptNote(key, 'x', {
    ...note('oi'),
    images: { 'assets/../../etc/passwd': 'a'.repeat(64) },
  })
  await evil.client.putNote('x', null, { ...sealed, deleted: false })
  const files = imageFolder()
  const out = await device(remote, key).sync({ images: files })
  assert.equal(out.error, 'invalid_image')
  assert.equal(files.map.size, 0)
})

test('asset references are found in links and HTML, once each', async () => {
  const { assetReferences } = await import('./sync/engine.js')
  assert.deepEqual(
    assetReferences(
      '![a](assets/x.png) ![b](./assets/x.png) <img src="assets/y%20z.png"> assets/no',
    ),
    ['assets/no', 'assets/x.png', 'assets/y z.png'],
  )
})

test('at the server image limit, notes without new images still sync', async () => {
  const remote = server()
  const key = generateKeyBytes()
  const limited = {
    ...remote,
    fetch: async (url, init) =>
      String(url).includes('/v1/blobs/') && init?.method === 'PUT'
        ? new Response('{"error":"quota_exceeded"}', { status: 507 })
        : remote.fetch(url, init),
  }
  const phone = device(limited, key, {
    a: note('só texto', 'A'),
    b: note('![F](assets/f.png)', 'B'),
  })
  const files = imageFolder({ 'assets/f.png': new Uint8Array([1, 2]) })
  const out = await phone.sync({ images: files })
  assert.equal(out.error, 'quota_exceeded')
  assert.deepEqual(Object.keys(out.state.bases), ['a'])
  // Next month the image goes up and the waiting note follows.
  const later = device(remote, key)
  later.notes = phone.notes
  later.state = phone.state
  assert.equal((await later.sync({ images: files })).error, undefined)
  assert.deepEqual(Object.keys(later.state.bases).sort(), ['a', 'b'])
})
