// Administration commands, against the real schema on local D1 (Miniflare).
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { SQL, newInvite, run, usageReport } from './admin.js'
import { miniflare } from './test-d1.js'

after(() => miniflare.dispose())

test('invites are 80-bit codes stored only as a hash that sign-up accepts', () => {
  const a = newInvite()
  assert.match(a.code, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/)
  assert.notEqual(newInvite().code, a.code)
  assert.match(a.hash, /^[0-9a-f]{64}$/)
  assert.throws(() => SQL.invite("x'); DROP TABLE accounts;--"))
})

test('every query runs on the real schema', async () => {
  const { db } = await miniflare()
  await db
    .prepare(
      "INSERT INTO accounts (id,email,name,auth_hash,wrapped_key,recovery_hash) VALUES ('a','ana@example.com','Ana','h','w','r')",
    )
    .run()
  await db
    .prepare("INSERT INTO sessions (token_hash, account_id) VALUES ('s1','a'), ('s2','a')")
    .run()
  await db.prepare(SQL.invite(newInvite().hash)).run()
  const accounts = (await db.prepare(SQL.accounts).all()).results
  assert.deepEqual(
    accounts.map(({ email, notes, sessions }) => ({ email, notes, sessions })),
    [{ email: 'ana@example.com', notes: 0, sessions: 2 }],
  )
  assert.equal((await db.prepare(SQL.invites).all()).results.length, 1)
  assert.deepEqual((await db.prepare(SQL.usage).all()).results[0], {
    bytes: 0,
    writes: 0,
    reads: 0,
  })
  await db.prepare(SQL.revoke(' ANA@example.com ')).run()
  assert.equal((await db.prepare(SQL.accounts).all()).results[0].sessions, 0)
})

test('revoking refuses anything that is not a plain e-mail', () => {
  for (const bad of ["a'@b.com", 'a@b.com; DROP TABLE x', 'sem-arroba', ''])
    assert.throws(() => SQL.revoke(bad), /e-mail inválido/)
})

test('commands print readable text and help', () => {
  const lines = []
  const log = (text) => lines.push(text)
  assert.equal(run(['-h'], { log, query: () => [] }), 0)
  assert.match(lines.join('\n'), /convite\s+cria um código/)
  lines.length = 0
  assert.equal(run(['revogar'], { log, query: () => [] }), 1)
  assert.equal(run(['nada'], { log, query: () => [] }), 1)
  lines.length = 0
  run(['contas'], {
    log,
    query: () => [
      { name: 'Ana', email: 'ana@example.com', created_at: '2026-11-16', notes: 3, sessions: 1 },
    ],
  })
  assert.match(lines[0], /Nome\s+E-mail/)
  assert.match(lines[0], /ana@example\.com\s+2026-11-16\s+3\s+1/)
  const calls = []
  run(['convite', '--local'], { log, query: (sql, local) => calls.push([sql, local]) })
  assert.match(calls[0][0], /^INSERT INTO invites/)
  assert.equal(calls[0][1], true)
  assert.match(
    usageReport({ bytes: 4.5e9, writes: 1000, reads: 0 }),
    /4,50 GB de 9,00 GB \(50,0%\)/,
  )
})

test('wrangler errors become instructions', async () => {
  const { explainFailure } = await import('./admin.js')
  const error = (text, code = 7500) =>
    JSON.stringify({ error: { text: 'A request failed.', notes: [{ text }], code } })
  assert.match(explainFailure(error('no such table: accounts: SQLITE_ERROR')), /migrations apply/)
  assert.match(explainFailure(error('not found', 7400)), /database_id/)
  assert.match(explainFailure('texto solto'), /texto solto/)
})
