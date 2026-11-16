// Accounts (ADR 0024) through the real Worker on local D1 + R2.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { sha256Hex } from './api.js'
import { miniflare } from './test-d1.js'

after(() => miniflare.dispose())

const LEGACY = 'L'.repeat(40)
const key = (char) => char.repeat(43)
const hash = (text) => sha256Hex(new TextEncoder().encode(text))

async function setup() {
  const { db, bucket } = await miniflare()
  const { default: worker } = await import('./worker.js')
  const env = { DB: db, BLOBS: bucket, SYNC_TOKEN: LEGACY }
  const call = (path, { method = 'GET', token, body, headers = {} } = {}) =>
    worker.fetch(
      new Request(`https://sync.test${path}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    )
  const invite = async (code) =>
    db
      .prepare('INSERT INTO invites (code_hash) VALUES (?)')
      .bind(await hash(code))
      .run()
  const signup = (email, invite, authKey = key('a')) =>
    call('/v1/accounts', {
      method: 'POST',
      body: {
        name: 'Ana',
        email,
        invite,
        authKey,
        recoveryAuth: key('r'),
        wrappedKey: 'w'.repeat(82),
      },
    })
  const putNote = (token, id = 'n1') =>
    call(`/v1/notes/${id}`, {
      method: 'PUT',
      token,
      headers: { 'if-none-match': '*' },
      body: { hash: 'a'.repeat(64), deleted: false, envelope: 'AQ==' },
    })
  return { db, env, call, invite, signup, putNote }
}

test('an invite creates one account with a session; the e-mail and the invite are used once', async () => {
  const { db, call, invite, signup } = await setup()
  await invite('ABCDEFGHJK')
  assert.equal((await signup('ana@example.com', 'WRONGCODE1')).status, 403)
  const created = await signup('Ana@Example.com', 'abcd-efgh-jk')
  assert.equal(created.status, 201)
  const { token, name } = await created.json()
  assert.equal(name, 'Ana')
  assert.equal((await call('/v1/changes', { token })).status, 200)
  assert.equal((await signup('bia@example.com', 'ABCDEFGHJK')).status, 403, 'invite already used')
  await invite('10101010A0')
  assert.equal((await signup('ola@example.com', 'iOlO-lOiO-ao')).status, 201, 'O/0 and I/L/1 match')
  await invite('ZZZZZZZZZZ')
  const taken = await signup('ana@example.com', 'ZZZZZZZZZZ')
  assert.equal(taken.status, 409)
  assert.deepEqual(await taken.json(), { error: 'email_taken' })
  const unused = await db
    .prepare('SELECT used_by FROM invites WHERE code_hash = ?')
    .bind(await hash('ZZZZZZZZZZ'))
    .first()
  assert.equal(unused.used_by, null, 'a refused sign-up keeps the invite')
  const stored = await db.prepare('SELECT * FROM accounts').first()
  assert.equal(stored.email, 'ana@example.com')
  assert.equal(stored.auth_hash, await hash(key('a')), 'only the hash of the proof is kept')
  assert.ok(!JSON.stringify(await db.prepare('SELECT * FROM sessions').all()).includes(token))
})

test('two sign-ups racing for one invite create only one account', async () => {
  const { db, invite, signup } = await setup()
  await invite('RACERACE00')
  const results = await Promise.all([
    signup('a@example.com', 'RACERACE00'),
    signup('b@example.com', 'RACERACE00'),
  ])
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 403])
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM accounts').first()).n, 1)
})

test('login, isolation between accounts, logout and password reset', async () => {
  const { call, invite, signup, putNote } = await setup()
  await invite('AAAAAAAAAA')
  await invite('BBBBBBBBBB')
  const ana = (await (await signup('ana@example.com', 'AAAAAAAAAA')).json()).token
  const bia = (await (await signup('bia@example.com', 'BBBBBBBBBB', key('b'))).json()).token
  assert.equal((await putNote(ana)).status, 200)
  assert.equal((await call('/v1/notes/n1', { token: bia })).status, 404)
  assert.equal((await call('/v1/notes/n1', { token: LEGACY })).status, 404)

  const login = (authKey) =>
    call('/v1/sessions', { method: 'POST', body: { email: 'ana@example.com', authKey } })
  const wrong = await login(key('x'))
  assert.equal(wrong.status, 401)
  assert.deepEqual(await wrong.json(), { error: 'invalid_login' })
  const right = await login(key('a'))
  assert.equal(right.status, 200)
  const session = await right.json()
  assert.equal(session.wrappedKey, 'w'.repeat(82))
  assert.equal((await call('/v1/notes/n1', { token: session.token })).status, 200)

  assert.equal(
    (await call('/v1/sessions/current', { method: 'DELETE', token: session.token })).status,
    204,
  )
  assert.equal((await call('/v1/notes/n1', { token: session.token })).status, 401)

  const recover = (recoveryAuth) =>
    call('/v1/recover', {
      method: 'POST',
      body: {
        email: 'ana@example.com',
        recoveryAuth,
        authKey: key('n'),
        wrappedKey: 'v'.repeat(82),
      },
    })
  assert.equal((await recover(key('x'))).status, 401)
  const reset = await recover(key('r'))
  assert.equal(reset.status, 200)
  const fresh = (await reset.json()).token
  assert.equal((await call('/v1/notes/n1', { token: ana })).status, 401, 'old sessions end')
  assert.equal((await call('/v1/notes/n1', { token: fresh })).status, 200)
  assert.equal((await login(key('a'))).status, 401)
  assert.equal((await (await login(key('n'))).json()).wrappedKey, 'v'.repeat(82))
})

test('account routes refuse bad input, repeated guesses and keep CORS for the app', async () => {
  const { call, invite, signup } = await setup()
  await invite('CCCCCCCCCC')
  assert.equal((await signup('not-an-email', 'CCCCCCCCCC')).status, 400)
  assert.equal((await signup('c@example.com', 'CCCCCCCCCC', 'short')).status, 400)
  const big = await call('/v1/accounts', {
    method: 'POST',
    body: { name: 'x'.repeat(5000) },
  })
  assert.equal(big.status, 400)
  let last
  for (let attempt = 0; attempt < 11; attempt++)
    last = await call('/v1/sessions', {
      method: 'POST',
      body: { email: 'guess@example.com', authKey: key('g') },
    })
  assert.equal(last.status, 429)
  assert.ok(Number(last.headers.get('retry-after')) > 0)
  const preflight = await call('/v1/accounts', { method: 'OPTIONS' })
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/)
  assert.match(preflight.headers.get('access-control-allow-methods'), /DELETE/)
  assert.equal(last.headers.get('access-control-allow-origin'), '*')
})

test('the Worker without SYNC_TOKEN refuses unknown credentials instead of failing', async () => {
  const { call, env } = await setup()
  delete env.SYNC_TOKEN
  assert.equal((await call('/v1/changes', { token: LEGACY })).status, 401)
  assert.equal((await call('/v1/changes')).status, 401)
})
