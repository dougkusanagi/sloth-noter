// Accounts with e-mail and password (ADR 0024). The app derives two values from the
// password before sending anything: `authKey` proves the password, and the note key
// travels wrapped by a second key the server never sees. The server keeps only
// SHA-256 of `authKey`, of the recovery proof and of each session token.
import { CORS, createApi, rateLimiter, sha256Hex } from './api.js'
import { routeSpaces } from './spaces.js'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const KEY = /^[A-Za-z0-9_-]{43}$/
const WRAPPED = /^[A-Za-z0-9_-]{40,200}$/
const MAX_BODY = 4096
const ACCOUNT_ROUTES = new Set(['/v1/accounts', '/v1/sessions', '/v1/recover', '/v1/pairing'])
const PAIRING_TTL_MS = 2 * 60 * 1000
const PAIRING_ID_RE = /^\/v1\/pairing\/([a-f0-9-]{8,64})(\/approve)?$/

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  })
const fail = (status, code) => json(status, { error: code })

const hash = (text) => sha256Hex(new TextEncoder().encode(text))
const newToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** Same rules the app uses before deriving keys: trimmed, lower case. */
export const normalizeEmail = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
/** Invite codes are typed by people: case, spaces, dashes and O/0, I/L/1 do not matter. */
export const normalizeInvite = (value) =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')

function sameHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index)
  return diff === 0
}

async function readBody(request) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return null
  try {
    const text = await request.text()
    if (text.length > MAX_BODY) return null
    const body = JSON.parse(text)
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null
  } catch {
    return null
  }
}

const validEmail = (email) => email.length <= 254 && EMAIL.test(email)

/** Per-key limiter (e-mail or invite), so one person cannot lock everyone else out. */
export function keyedLimiter({ limit = 10, windowMs = 60_000, now = () => Date.now() } = {}) {
  const limiters = new Map()
  return (key) => {
    if (limiters.size > 1000) limiters.clear()
    if (!limiters.has(key)) limiters.set(key, rateLimiter({ limit, windowMs, now }))
    return limiters.get(key)()
  }
}

/**
 * Whole server: account routes, then data routes for a session, then the legacy
 * credentials (`legacy(request)` or null). `storeFor(accountId)` returns the data store.
 */
export function createServer({
  directory,
  storeFor,
  spaces = null,
  spaceStoreFor = null,
  legacy = () => null,
  limit = () => 0,
  attempts = keyedLimiter(),
}) {
  const slowDown = (key) => {
    const wait = attempts(key)
    if (!wait) return null
    const response = fail(429, 'rate_limited')
    response.headers.set('retry-after', String(wait))
    return response
  }

  async function signup(request) {
    const body = await readBody(request)
    const email = normalizeEmail(body?.email)
    const name = String(body?.name ?? '').trim()
    const invite = normalizeInvite(body?.invite)
    if (
      !body ||
      !validEmail(email) ||
      !name ||
      name.length > 100 ||
      !/^[0-9A-Z]{8,64}$/.test(invite) ||
      !KEY.test(body.authKey ?? '') ||
      !KEY.test(body.recoveryAuth ?? '') ||
      !WRAPPED.test(body.wrappedKey ?? '')
    )
      return fail(400, 'bad_request')
    const blocked = slowDown(`invite:${invite}`)
    if (blocked) return blocked
    const token = newToken()
    const publicKey =
      typeof body.publicKey === 'string' && body.publicKey.length <= 2048 ? body.publicKey : null
    const wrappedPrivateKey =
      typeof body.wrappedPrivateKey === 'string' && body.wrappedPrivateKey.length <= 2048
        ? body.wrappedPrivateKey
        : null
    const result = await directory.createAccount({
      id: crypto.randomUUID(),
      email,
      name,
      inviteHash: await hash(invite),
      authHash: await hash(body.authKey),
      recoveryHash: await hash(body.recoveryAuth),
      wrappedKey: body.wrappedKey,
      publicKey,
      wrappedPrivateKey,
      sessionHash: await hash(token),
    })
    if (result === 'invalid_invite') return fail(403, 'invalid_invite')
    if (result === 'email_taken') return fail(409, 'email_taken')
    return json(201, { token, name })
  }

  async function login(request) {
    const body = await readBody(request)
    const email = normalizeEmail(body?.email)
    if (!body || !validEmail(email) || !KEY.test(body.authKey ?? ''))
      return fail(400, 'bad_request')
    const blocked = slowDown(`login:${email}`)
    if (blocked) return blocked
    const account = await directory.findAccount(email)
    // Same answer for an unknown e-mail and a wrong password.
    if (!account || !sameHex(await hash(body.authKey), account.authHash))
      return fail(401, 'invalid_login')
    const token = newToken()
    await directory.createSession(account.id, await hash(token))
    return json(200, {
      token,
      name: account.name,
      wrappedKey: account.wrappedKey,
      publicKey: account.publicKey ?? null,
      wrappedPrivateKey: account.wrappedPrivateKey ?? null,
    })
  }

  async function recover(request) {
    const body = await readBody(request)
    const email = normalizeEmail(body?.email)
    if (
      !body ||
      !validEmail(email) ||
      !KEY.test(body.recoveryAuth ?? '') ||
      !KEY.test(body.authKey ?? '') ||
      !WRAPPED.test(body.wrappedKey ?? '')
    )
      return fail(400, 'bad_request')
    const blocked = slowDown(`login:${email}`)
    if (blocked) return blocked
    const account = await directory.findAccount(email)
    if (!account || !sameHex(await hash(body.recoveryAuth), account.recoveryHash))
      return fail(401, 'invalid_recovery')
    const token = newToken()
    // The new password replaces the old one and ends every other session.
    await directory.resetPassword(account.id, {
      authHash: await hash(body.authKey),
      wrappedKey: body.wrappedKey,
      sessionHash: await hash(token),
    })
    return json(200, { token, name: account.name, wrappedKey: body.wrappedKey })
  }

  const pairings = new Map()
  function prunePairings() {
    const now = Date.now()
    for (const [id, entry] of pairings) {
      if (entry.expiresAt <= now) pairings.delete(id)
    }
  }
  return async function handle(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    const path = new URL(request.url).pathname
    if (request.method === 'POST' && ACCOUNT_ROUTES.has(path)) {
      const wait = limit()
      if (wait) {
        const response = fail(429, 'rate_limited')
        response.headers.set('retry-after', String(wait))
        return response
      }
    }
    try {
      if (request.method === 'POST' && path === '/v1/accounts') return await signup(request)
      if (request.method === 'POST' && path === '/v1/sessions') return await login(request)
      if (request.method === 'POST' && path === '/v1/recover') return await recover(request)
      if (request.method === 'POST' && path === '/v1/pairing') {
        prunePairings()
        const id = crypto.randomUUID()
        const expiresAt = Date.now() + PAIRING_TTL_MS
        pairings.set(id, { expiresAt, encrypted: null })
        return json(201, { id, expiresAt })
      }
      const pairMatch = PAIRING_ID_RE.exec(path)
      if (request.method === 'GET' && pairMatch && !pairMatch[2]) {
        prunePairings()
        const entry = pairings.get(pairMatch[1])
        if (!entry) return fail(404, 'not_found')
        if (!entry.encrypted) return json(200, { status: 'pending', expiresAt: entry.expiresAt })
        pairings.delete(pairMatch[1])
        return json(200, { status: 'approved', encrypted: entry.encrypted })
      }
    } catch {
      return fail(500, 'server_error')
    }

    const header = request.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (KEY.test(token)) {
      const tokenHash = await hash(token)
      let account
      try {
        account = await directory.sessionAccount(tokenHash)
      } catch {
        return fail(500, 'server_error')
      }
      if (account) {
        if (request.method === 'DELETE' && path === '/v1/sessions/current') {
          await directory.revokeSession(tokenHash)
          return new Response(null, { status: 204, headers: CORS })
        }
        const approveMatch = PAIRING_ID_RE.exec(path)
        if (request.method === 'POST' && approveMatch && approveMatch[2] === '/approve') {
          prunePairings()
          const entry = pairings.get(approveMatch[1])
          if (!entry) return fail(404, 'not_found')
          const body = await request.json().catch(() => null)
          if (!body?.encrypted || typeof body.encrypted !== 'object') return fail(400, 'bad_request')
          entry.encrypted = body.encrypted
          return json(200, { ok: true })
        }
        const spaceResponse = await routeSpaces({
          request,
          accountId: account,
          directory,
          spaces,
          spaceStoreFor,
          token,
          limit,
          normalizeEmail,
        })
        if (spaceResponse) return spaceResponse
        return createApi({ store: storeFor(account), token, limit })(request)
      }
    }
    return (await legacy(request)) ?? fail(401, 'unauthorized')
  }
}

/** D1 directory. Each change that must happen together runs in one batch (transaction). */
export function d1Directory(db) {
  return {
    async createAccount({
      id,
      email,
      name,
      inviteHash,
      authHash,
      recoveryHash,
      wrappedKey,
      publicKey = null,
      wrappedPrivateKey = null,
      sessionHash,
    }) {
      const invite = await db
        .prepare('SELECT 1 FROM invites WHERE code_hash = ? AND used_by IS NULL')
        .bind(inviteHash)
        .first()
      if (!invite) return 'invalid_invite'
      if (await db.prepare('SELECT 1 FROM accounts WHERE email = ?').bind(email).first())
        return 'email_taken'
      try {
        const [created] = await db.batch([
          // Inserts only while the invite is still unused, in the same transaction.
          db
            .prepare(
              `INSERT INTO accounts (id, email, name, auth_hash, wrapped_key, recovery_hash, public_key, wrapped_private_key)
               SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8
               WHERE EXISTS (SELECT 1 FROM invites WHERE code_hash = ?9 AND used_by IS NULL)`,
            )
            .bind(
              id,
              email,
              name,
              authHash,
              wrappedKey,
              recoveryHash,
              publicKey,
              wrappedPrivateKey,
              inviteHash,
            ),
          db
            .prepare(
              `UPDATE invites SET used_by = ?1, used_at = CURRENT_TIMESTAMP
               WHERE code_hash = ?2 AND used_by IS NULL
                 AND EXISTS (SELECT 1 FROM accounts WHERE id = ?1)`,
            )
            .bind(id, inviteHash),
          db
            .prepare(
              `INSERT INTO sessions (token_hash, account_id)
               SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM accounts WHERE id = ?2)`,
            )
            .bind(sessionHash, id),
        ])
        return created.meta.changes ? 'ok' : 'invalid_invite'
      } catch (error) {
        if (/UNIQUE/i.test(String(error?.message))) return 'email_taken'
        throw error
      }
    },
    async findAccount(email) {
      const row = await db
        .prepare(
          'SELECT id, email, name, auth_hash, wrapped_key, recovery_hash, public_key, wrapped_private_key FROM accounts WHERE email = ?',
        )
        .bind(email)
        .first()
      return (
        row && {
          id: row.id,
          email: row.email,
          name: row.name,
          authHash: row.auth_hash,
          wrappedKey: row.wrapped_key,
          recoveryHash: row.recovery_hash,
          publicKey: row.public_key ?? null,
          wrappedPrivateKey: row.wrapped_private_key ?? null,
        }
      )
    },
    async findAccountById(accountId) {
      const row = await db
        .prepare('SELECT id, email, name, public_key FROM accounts WHERE id = ?')
        .bind(accountId)
        .first()
      return (
        row && {
          id: row.id,
          email: row.email,
          name: row.name,
          publicKey: row.public_key ?? null,
        }
      )
    },
    async updateAccountKeys(accountId, { publicKey, wrappedPrivateKey }) {
      await db
        .prepare('UPDATE accounts SET public_key = ?, wrapped_private_key = ? WHERE id = ?')
        .bind(publicKey, wrappedPrivateKey, accountId)
        .run()
    },
    async createSession(accountId, sessionHash) {
      await db
        .prepare('INSERT INTO sessions (token_hash, account_id) VALUES (?, ?)')
        .bind(sessionHash, accountId)
        .run()
    },
    async sessionAccount(sessionHash) {
      const row = await db
        .prepare('SELECT account_id FROM sessions WHERE token_hash = ? AND revoked_at IS NULL')
        .bind(sessionHash)
        .first()
      return row?.account_id ?? null
    },
    async revokeSession(sessionHash) {
      await db
        .prepare('UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE token_hash = ?')
        .bind(sessionHash)
        .run()
    },
    async resetPassword(accountId, { authHash, wrappedKey, sessionHash }) {
      await db.batch([
        db
          .prepare('UPDATE accounts SET auth_hash = ?, wrapped_key = ? WHERE id = ?')
          .bind(authHash, wrappedKey, accountId),
        db
          .prepare(
            'UPDATE sessions SET revoked_at = CURRENT_TIMESTAMP WHERE account_id = ? AND revoked_at IS NULL',
          )
          .bind(accountId),
        db
          .prepare('INSERT INTO sessions (token_hash, account_id) VALUES (?, ?)')
          .bind(sessionHash, accountId),
      ])
    },
  }
}

/** In-memory directory with the same behavior, for tests and the E2E suite. */
export function memoryDirectory() {
  const accounts = new Map()
  const invites = new Map()
  const sessions = new Map()
  return {
    async addInvite(code) {
      invites.set(await hash(normalizeInvite(code)), null)
    },
    async createAccount({
      id,
      email,
      name,
      inviteHash,
      authHash,
      recoveryHash,
      wrappedKey,
      publicKey = null,
      wrappedPrivateKey = null,
      sessionHash,
    }) {
      if (!invites.has(inviteHash) || invites.get(inviteHash)) return 'invalid_invite'
      if ([...accounts.values()].some((account) => account.email === email)) return 'email_taken'
      accounts.set(id, {
        id,
        email,
        name,
        authHash,
        recoveryHash,
        wrappedKey,
        publicKey,
        wrappedPrivateKey,
      })
      invites.set(inviteHash, id)
      sessions.set(sessionHash, id)
      return 'ok'
    },
    async findAccount(email) {
      const account = [...accounts.values()].find((item) => item.email === email)
      return account ? { ...account } : null
    },
    async findAccountById(accountId) {
      const account = accounts.get(accountId)
      return account ? { ...account } : null
    },
    async updateAccountKeys(accountId, { publicKey, wrappedPrivateKey }) {
      const account = accounts.get(accountId)
      if (account) Object.assign(account, { publicKey, wrappedPrivateKey })
    },
    async createSession(accountId, sessionHash) {
      sessions.set(sessionHash, accountId)
    },
    async sessionAccount(sessionHash) {
      return sessions.get(sessionHash) ?? null
    },
    async revokeSession(sessionHash) {
      sessions.delete(sessionHash)
    },
    async resetPassword(accountId, { authHash, wrappedKey, sessionHash }) {
      Object.assign(accounts.get(accountId), { authHash, wrappedKey })
      for (const [key, value] of sessions) if (value === accountId) sessions.delete(key)
      sessions.set(sessionHash, accountId)
    },
  }
}
