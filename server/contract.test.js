// Contract tests required by ADR 0018 before the reference server (S2).
// `contract(makeStore)` is exported so the D1/R2 store in S2 runs the same cases.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createApi, rateLimiter, sha256Hex } from './api.js'
import { memoryStore } from './memory-store.js'

const TOKEN = 'k'.repeat(40)
const HASH = 'a'.repeat(64)

export function contract(label, makeStore) {
  const setup = async (options = {}) => {
    const store = options.store ?? (await makeStore())
    const api = createApi({ store, token: TOKEN, ...options })
    const call = (path, init = {}) =>
      api(
        new Request(`https://sync.test${path}`, {
          ...init,
          headers: { authorization: `Bearer ${TOKEN}`, ...init.headers },
        }),
      )
    const put = (id, body, headers) =>
      call(`/v1/notes/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      })
    return { store, api, call, put }
  }
  const note = (envelope = 'ZW52ZWxvcGU=') => ({ hash: HASH, deleted: false, envelope })

  test(`${label}: missing or wrong key returns 401 without reading or writing`, async () => {
    const { store, api } = await setup()
    let touched = false
    for (const key of Object.keys(store))
      if (typeof store[key] === 'function' && !/Cursor$/.test(key)) {
        const original = store[key]
        store[key] = (...args) => {
          touched = true
          return original(...args)
        }
      }
    for (const authorization of [undefined, 'Bearer wrong', `Basic ${TOKEN}`, `Bearer ${TOKEN}x`]) {
      const response = await api(
        new Request('https://sync.test/v1/notes/n1', {
          method: 'PUT',
          headers: { 'if-none-match': '*', ...(authorization ? { authorization } : {}) },
          body: JSON.stringify(note()),
        }),
      )
      assert.equal(response.status, 401)
      const text = await response.text()
      assert.deepEqual(JSON.parse(text), { error: 'unauthorized' })
      assert.ok(!text.includes(TOKEN))
    }
    assert.equal(touched, false)
  })

  test(`${label}: create and update keep revision, ETag, hash and cursor coherent`, async () => {
    const { call, put } = await setup()
    assert.equal((await put('n1', note())).status, 428)
    const created = await put('n1', note(), { 'if-none-match': '*' })
    assert.equal(created.status, 200)
    assert.deepEqual(await created.json(), { id: 'n1', revision: 1 })
    assert.equal((await put('n1', note(), { 'if-none-match': '*' })).status, 409)

    const read = await call('/v1/notes/n1')
    assert.equal(read.headers.get('etag'), '"1"')
    assert.deepEqual(await read.json(), {
      id: 'n1',
      revision: 1,
      hash: HASH,
      deleted: false,
      envelope: 'ZW52ZWxvcGU=',
    })
    const updated = await put(
      'n1',
      { ...note('b3V0cm8='), hash: 'b'.repeat(64) },
      { 'if-match': '"1"' },
    )
    assert.deepEqual(await updated.json(), { id: 'n1', revision: 2 })

    const changes = await (await call('/v1/changes')).json()
    assert.deepEqual(changes.changes, [
      { id: 'n1', revision: 2, hash: 'b'.repeat(64), deleted: false },
    ])
    assert.equal(changes.hasMore, false)
    const after = await (await call(`/v1/changes?since=${changes.cursor}`)).json()
    assert.deepEqual(after.changes, [])
    assert.equal(after.cursor, changes.cursor)
    assert.equal((await call('/v1/notes/missing')).status, 404)
  })

  test(`${label}: two writes on the same base, only one wins and the other gets 409`, async () => {
    const { call, put } = await setup()
    await put('n1', note(), { 'if-none-match': '*' })
    const results = await Promise.all([
      put('n1', note('YQ=='), { 'if-match': '"1"' }),
      put('n1', note('Yg=='), { 'if-match': '"1"' }),
    ])
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409])
    const loser = results.find((r) => r.status === 409)
    assert.deepEqual(await loser.json(), { error: 'conflict' })
    const winner = await results.find((r) => r.status === 200).json()
    assert.equal(winner.revision, 2)
    assert.equal((await (await call('/v1/notes/n1')).json()).revision, 2)
  })

  test(`${label}: a failed write is not published in changes`, async () => {
    const store = await makeStore()
    const original = store.putNote
    store.putNote = async () => {
      throw new Error(`disk full ${TOKEN}`)
    }
    const { call, put } = await setup({ store })
    const failed = await put('n1', note(), { 'if-none-match': '*' })
    assert.equal(failed.status, 500)
    const text = await failed.text()
    assert.deepEqual(JSON.parse(text), { error: 'server_error' })
    assert.ok(!text.includes(TOKEN) && !text.includes('disk'))
    assert.deepEqual((await (await call('/v1/changes')).json()).changes, [])
    store.putNote = original
    assert.equal((await put('n1', note(), { 'if-none-match': '*' })).status, 200)
  })

  test(`${label}: paging does not lose changes made between pages`, async () => {
    const { call, put } = await setup()
    for (let index = 0; index < 150; index++)
      await put(`n${index}`, note(), { 'if-none-match': '*' })
    const first = await (await call('/v1/changes')).json()
    assert.equal(first.changes.length, 100)
    assert.equal(first.hasMore, true)
    // An already-read note changes and a new note appears before the second page.
    await put('n0', note('bm92bw=='), { 'if-match': '"1"' })
    await put('late', note(), { 'if-none-match': '*' })
    const seen = new Map(first.changes.map((c) => [c.id, c.revision]))
    let cursor = first.cursor
    for (;;) {
      const page = await (await call(`/v1/changes?since=${cursor}`)).json()
      for (const change of page.changes) seen.set(change.id, change.revision)
      cursor = page.cursor
      if (!page.hasMore) break
    }
    assert.equal(seen.size, 151)
    assert.equal(seen.get('n0'), 2)
    assert.equal(seen.get('late'), 1)
    assert.equal((await call('/v1/changes?since=bogus')).status, 400)
  })

  test(`${label}: a deletion mark shows in changes without the deleted content`, async () => {
    const { call, put } = await setup()
    await put('n1', note('c2VncmVkbw=='), { 'if-none-match': '*' })
    const invalid = await put(
      'n1',
      { hash: HASH, deleted: true, envelope: 'c2VncmVkbw==' },
      {
        'if-match': '"1"',
      },
    )
    assert.equal(invalid.status, 400)
    const removed = await put(
      'n1',
      { hash: HASH, deleted: true, envelope: null },
      {
        'if-match': '"1"',
      },
    )
    assert.equal(removed.status, 200)
    const changes = await (await call('/v1/changes')).json()
    assert.deepEqual(changes.changes, [{ id: 'n1', revision: 2, hash: HASH, deleted: true }])
    const text = await (await call('/v1/notes/n1')).text()
    assert.equal(JSON.parse(text).envelope, null)
    assert.ok(!text.includes('c2VncmVkbw'))
  })

  test(`${label}: blob PUT is idempotent and a wrong hash is not stored`, async () => {
    const { call } = await setup()
    const bytes = new TextEncoder().encode('envelope-bytes')
    const sha = await sha256Hex(bytes)
    const send = (path, body) => call(path, { method: 'PUT', body })
    assert.equal((await send(`/v1/blobs/${sha}`, bytes)).status, 201)
    assert.equal((await send(`/v1/blobs/${sha}`, bytes)).status, 204)
    const read = await call(`/v1/blobs/${sha}`)
    assert.deepEqual(new Uint8Array(await read.arrayBuffer()), bytes)

    const other = 'f'.repeat(64)
    const mismatch = await send(`/v1/blobs/${other}`, bytes)
    assert.equal(mismatch.status, 400)
    assert.deepEqual(await mismatch.json(), { error: 'hash_mismatch' })
    assert.equal((await call(`/v1/blobs/${other}`)).status, 404)
    assert.equal((await call('/v1/blobs/not-a-hash')).status, 400)
  })

  test(`${label}: rate limit answers 429 with Retry-After and keeps data`, async () => {
    let time = 0
    const { call, put } = await setup({
      limit: rateLimiter({ limit: 2, windowMs: 10_000, now: () => time }),
    })
    assert.equal((await put('n1', note(), { 'if-none-match': '*' })).status, 200)
    assert.equal((await call('/v1/notes/n1')).status, 200)
    const limited = await put('n1', note('eA=='), { 'if-match': '"1"' })
    assert.equal(limited.status, 429)
    assert.equal(limited.headers.get('retry-after'), '10')
    assert.deepEqual(await limited.json(), { error: 'rate_limited' })
    time = 10_000
    const read = await (await call('/v1/notes/n1')).json()
    assert.equal(read.revision, 1)
    assert.equal(read.envelope, 'ZW52ZWxvcGU=')
  })

  test(`${label}: CORS lets the app origin call with its Bearer key`, async () => {
    const { api, call } = await setup()
    const preflight = await api(
      new Request('https://sync.test/v1/notes/n1', {
        method: 'OPTIONS',
        headers: { origin: 'tauri://localhost', 'access-control-request-method': 'PUT' },
      }),
    )
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
    assert.match(preflight.headers.get('access-control-allow-headers'), /authorization/)
    assert.match(preflight.headers.get('access-control-allow-headers'), /if-match/)
    const read = await call('/v1/changes')
    assert.equal(read.headers.get('access-control-allow-origin'), '*')
    assert.match(read.headers.get('access-control-expose-headers'), /retry-after/)
    const denied = await api(new Request('https://sync.test/v1/changes'))
    assert.equal(denied.status, 401)
    assert.equal(denied.headers.get('access-control-allow-origin'), '*')
  })

  test(`${label}: invalid ids, bodies and preconditions are rejected`, async () => {
    const { put, call } = await setup()
    assert.equal((await put('../x', note(), { 'if-none-match': '*' })).status, 404)
    assert.equal((await put('a.b', note(), { 'if-none-match': '*' })).status, 400)
    assert.equal((await put('n1', { ...note(), hash: 'x' }, { 'if-none-match': '*' })).status, 400)
    assert.equal(
      (await put('n1', { ...note(), envelope: '<script>' }, { 'if-none-match': '*' })).status,
      400,
    )
    assert.equal((await put('n1', note(), { 'if-match': 'W/"1"' })).status, 400)
    assert.equal((await put('n1', note(), { 'if-match': '"1"' })).status, 409)
    assert.equal((await call('/v2/changes')).status, 404)
  })

  test(`${label}: export and import keep ids, revisions, blobs and marks`, async () => {
    const { store, put, call } = await setup()
    await put('n1', note(), { 'if-none-match': '*' })
    await put('n1', note('Mg=='), { 'if-match': '"1"' })
    await put('gone', note(), { 'if-none-match': '*' })
    await put('gone', { hash: HASH, deleted: true, envelope: null }, { 'if-match': '"1"' })
    const bytes = new Uint8Array([1, 2, 3])
    const sha = await sha256Hex(bytes)
    await call(`/v1/blobs/${sha}`, { method: 'PUT', body: bytes })

    const target = await setup()
    await target.store.importAll(await store.exportAll())
    assert.deepEqual(
      await (await target.call('/v1/notes/n1')).json(),
      await (await call('/v1/notes/n1')).json(),
    )
    const mark = await (await target.call('/v1/notes/gone')).json()
    assert.deepEqual([mark.revision, mark.deleted, mark.envelope], [2, true, null])
    assert.deepEqual(
      new Uint8Array(await (await target.call(`/v1/blobs/${sha}`)).arrayBuffer()),
      bytes,
    )
    assert.equal((await target.put('n1', note(), { 'if-match': '"2"' })).status, 200)
  })
}

contract('memory', memoryStore)

// Same contract against D1 + R2 through Miniflare (local workerd, no network).
const { Miniflare } = await import('miniflare')
const { readFile } = await import('node:fs/promises')
const schema = (
  await Promise.all(
    ['0001_notes.sql', '0002_usage.sql'].map((name) =>
      readFile(new URL(`./migrations/${name}`, import.meta.url), 'utf8'),
    ),
  )
).join('\n')
const { cloudflareStore } = await import('./cloudflare-store.js')
const instances = []
after(() => Promise.all(instances.map((mf) => mf.dispose())))
async function miniflare() {
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch: () => new Response() }',
    d1Databases: ['DB'],
    r2Buckets: ['BLOBS'],
  })
  instances.push(mf)
  const db = await mf.getD1Database('DB')
  // exec runs one statement per line.
  await db.exec(
    schema
      .replace(/--.*\n/g, '')
      .split(';')
      .map((statement) => statement.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(';\n'),
  )
  return { db, bucket: await mf.getR2Bucket('BLOBS') }
}

contract('cloudflare', async () => {
  const { db, bucket } = await miniflare()
  return cloudflareStore(db, bucket)
})

test('the Worker stops at its R2 limits and answers 507 without writing', async () => {
  const { db, bucket } = await miniflare()
  let date = new Date('2026-11-13T12:00:00Z')
  const store = cloudflareStore(db, bucket, {
    limits: { bytes: 10, writes: 2, reads: 2 },
    now: () => date,
  })
  const api = createApi({ store, token: TOKEN })
  const put = async (bytes) =>
    api(
      new Request(`https://sync.test/v1/blobs/${await sha256Hex(bytes)}`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${TOKEN}` },
        body: bytes,
      }),
    )
  const get = async (bytes) =>
    api(
      new Request(`https://sync.test/v1/blobs/${await sha256Hex(bytes)}`, {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    )
  const a = new Uint8Array([1, 2, 3, 4])
  const b = new Uint8Array([5, 6, 7, 8])
  assert.equal((await put(a)).status, 201)
  assert.equal((await put(a)).status, 204, 'a repeated blob costs no R2 operation')
  // Storage: 4 + 8 bytes would pass the 10-byte limit.
  const big = await put(new Uint8Array(8))
  assert.equal(big.status, 507)
  assert.deepEqual(await big.json(), { error: 'quota_exceeded' })
  assert.equal((await put(b)).status, 201)
  // Writes: the month already used 2.
  assert.equal((await put(new Uint8Array([9]))).status, 507)
  assert.equal((await get(a)).status, 200)
  assert.equal((await get(b)).status, 200)
  assert.equal((await get(a)).status, 507, 'reads stop at the limit')
  // A new month starts the operation counts again; storage stays counted.
  date = new Date('2026-12-01T00:00:00Z')
  assert.equal((await get(a)).status, 200)
  assert.equal((await put(new Uint8Array([9]))).status, 201)
  assert.equal((await put(new Uint8Array([1, 1]))).status, 507)
})

test('the API refuses short tokens', () => {
  assert.throws(() => createApi({ store: memoryStore(), token: 'short' }))
})
