import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, memoryDirectory } from '../server/accounts.js'
import { createApi } from '../server/api.js'
import { memoryStore } from '../server/memory-store.js'
import { recoverAccount, signIn, signOut, signUp } from './sync/account.js'
import { createClient } from './sync/client.js'
import { accountKeys, unwrapNoteKey, wrapNoteKey } from './sync/crypto.js'

const SERVER = 'https://sync.test'
const LEGACY = 'L'.repeat(40)
// Few iterations keep the tests fast; the app uses PASSWORD_ITERATIONS.
const iterations = 1000

async function setup() {
  const directory = memoryDirectory()
  await directory.addInvite('ABCD-EFGH-JKMN-PQRS')
  const stores = new Map()
  const requests = []
  const legacyApi = createApi({ store: memoryStore(), token: LEGACY })
  const handle = createServer({
    directory,
    storeFor: (account) => {
      if (!stores.has(account)) stores.set(account, memoryStore())
      return stores.get(account)
    },
    legacy: (request) =>
      request.headers.get('authorization') === `Bearer ${LEGACY}` ? legacyApi(request) : null,
  })
  const fetch = async (url, init = {}) => {
    const request = new Request(url, init)
    requests.push(await request.clone().text())
    return handle(request)
  }
  return { fetch, requests, directory }
}

const PASSWORD = 'senha forte 123'
const account = (fetch, extra = {}) =>
  signUp({
    server: SERVER,
    name: ' Ana ',
    email: ' Ana@Example.com ',
    password: PASSWORD,
    invite: 'abcd efgh jkmn pqrs',
    fetch,
    iterations,
    ...extra,
  })

test('the password-derived keys are stable and wrap the note key for one e-mail only', async () => {
  const a = await accountKeys('ana@example.com', 'x'.repeat(8), iterations)
  const b = await accountKeys('ana@example.com', 'x'.repeat(8), iterations)
  assert.equal(a.authKey, b.authKey)
  assert.match(a.authKey, /^[A-Za-z0-9_-]{43}$/)
  const other = await accountKeys('bia@example.com', 'x'.repeat(8), iterations)
  assert.notEqual(a.authKey, other.authKey, 'the e-mail is the salt')
  const key = crypto.getRandomValues(new Uint8Array(32))
  const wrapped = await wrapNoteKey(a.wrapKey, key, 'ana@example.com')
  assert.deepEqual(await unwrapNoteKey(b.wrapKey, wrapped, 'ana@example.com'), key)
  await assert.rejects(unwrapNoteKey(other.wrapKey, wrapped, 'ana@example.com'))
  await assert.rejects(unwrapNoteKey(a.wrapKey, wrapped, 'bia@example.com'))
})

test('sign-up needs a valid invite, uses it once and never sends the password', async () => {
  const { fetch, requests } = await setup()
  await assert.rejects(account(fetch, { invite: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' }), {
    code: 'invalid_invite',
  })
  const created = await account(fetch)
  assert.equal(created.name, 'Ana')
  assert.equal(created.email, 'ana@example.com')
  assert.match(created.recovery, /^([0-9A-Z]{5}-){10}[0-9A-Z]{5}$/)
  assert.ok(requests.every((body) => !body.includes(PASSWORD)))
  await assert.rejects(account(fetch, { email: 'bia@example.com' }), { code: 'invalid_invite' })
})

test('the e-mail is taken once, and wrong passwords get the same answer as unknown e-mails', async () => {
  const { fetch, directory } = await setup()
  await account(fetch)
  await directory.addInvite('2222-2222-2222-2222')
  await assert.rejects(account(fetch, { invite: '2222-2222-2222-2222' }), { code: 'email_taken' })
  for (const [email, password] of [
    ['ana@example.com', 'senha errada'],
    ['ninguem@example.com', PASSWORD],
  ])
    await assert.rejects(signIn({ server: SERVER, email, password, fetch, iterations }), {
      code: 'invalid_login',
    })
})

test('signing in on another device gives the same note key, and notes stay per account', async () => {
  const { fetch, directory } = await setup()
  const first = await account(fetch)
  const second = await signIn({
    server: SERVER,
    email: 'ANA@example.com',
    password: PASSWORD,
    fetch,
    iterations,
  })
  assert.deepEqual(second.key, first.key)
  assert.notEqual(second.token, first.token)

  const note = { hash: 'a'.repeat(64), deleted: false, envelope: 'AQ==' }
  await createClient({ server: SERVER, token: first.token, fetch }).putNote('n1', null, note)
  assert.equal(
    (await createClient({ server: SERVER, token: second.token, fetch }).getNote('n1')).envelope,
    'AQ==',
  )
  await directory.addInvite('3333-3333-3333-3333')
  const other = await account(fetch, { email: 'bia@example.com', invite: '3333-3333-3333-3333' })
  assert.equal(
    await createClient({ server: SERVER, token: other.token, fetch }).getNote('n1'),
    null,
  )
  // The credentials from before accounts keep reaching only their old space.
  assert.equal(await createClient({ server: SERVER, token: LEGACY, fetch }).getNote('n1'), null)

  await signOut({ server: SERVER, token: first.token, fetch })
  await assert.rejects(createClient({ server: SERVER, token: first.token, fetch }).getNote('n1'), {
    code: 'unauthorized',
  })
})

test('the recovery key sets a new password and ends the old sessions', async () => {
  const { fetch } = await setup()
  const first = await account(fetch)
  const bad = first.recovery.replace(/^./, (char) => (char === '0' ? '1' : '0'))
  await assert.rejects(
    recoverAccount({
      server: SERVER,
      email: 'ana@example.com',
      recovery: bad,
      password: 'nova senha 1',
      fetch,
      iterations,
    }),
    { code: 'bad_recovery' },
  )
  await assert.rejects(
    recoverAccount({
      server: SERVER,
      email: 'ana@example.com',
      recovery: first.recovery,
      password: 'curta',
      fetch,
      iterations,
    }),
    { code: 'weak_password' },
  )
  const reset = await recoverAccount({
    server: SERVER,
    email: 'ana@example.com',
    recovery: first.recovery.toLowerCase(),
    password: 'nova senha 1',
    fetch,
    iterations,
  })
  assert.deepEqual(reset.key, first.key)
  await assert.rejects(createClient({ server: SERVER, token: first.token, fetch }).changes(null), {
    code: 'unauthorized',
  })
  await assert.rejects(
    signIn({ server: SERVER, email: 'ana@example.com', password: PASSWORD, fetch, iterations }),
    { code: 'invalid_login' },
  )
  const again = await signIn({
    server: SERVER,
    email: 'ana@example.com',
    password: 'nova senha 1',
    fetch,
    iterations,
  })
  assert.deepEqual(again.key, first.key)
})

test('the app checks the form before deriving keys and explains an old server', async () => {
  const { fetch } = await setup()
  await assert.rejects(account(fetch, { email: 'sem-arroba' }), { code: 'bad_email' })
  await assert.rejects(account(fetch, { password: '1234567' }), { code: 'weak_password' })
  await assert.rejects(account(fetch, { name: '  ' }), { code: 'bad_name' })
  await assert.rejects(account(fetch, { server: 'http://example.com' }), {
    code: 'insecure_server',
  })
  const oldServer = createApi({ store: memoryStore(), token: LEGACY })
  await assert.rejects(
    signIn({
      server: SERVER,
      email: 'ana@example.com',
      password: PASSWORD,
      fetch: async (url, init) => oldServer(new Request(url, init)),
      iterations,
    }),
    { code: 'no_accounts' },
  )
})
