// Account calls (ADR 0024): create an account, sign in, reset the password with the
// recovery key, and sign out. The password never leaves this module: only `authKey`
// and the wrapped note key go to the server.

import { SyncError, serverRoot } from './client.js'
import {
  accountKeys,
  generateKeyBytes,
  keyFromRecovery,
  recoveryKey,
  recoveryProof,
  unwrapNoteKey,
  wrapNoteKey,
} from './crypto.js'

/** The project's server. A build can point elsewhere with VITE_SYNC_SERVER. */
export const DEFAULT_SERVER =
  import.meta.env?.VITE_SYNC_SERVER || 'https://sloth-note-sync.dl-aguiar.workers.dev'
export const MIN_PASSWORD = 8

const TIMEOUT = 30_000
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SERVER_CODES = new Set([
  'invalid_invite',
  'email_taken',
  'invalid_login',
  'invalid_recovery',
  'rate_limited',
])

export const normalizeEmail = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

function checkEmail(email) {
  if (email.length > 254 || !EMAIL.test(email)) throw new SyncError('bad_email')
}

function checkPassword(password) {
  if (String(password ?? '').length < MIN_PASSWORD) throw new SyncError('weak_password')
}

async function post(server, path, body, { fetch = globalThis.fetch, token } = {}) {
  const root = serverRoot(server)
  let response
  try {
    response = await fetch(`${root}${path}`, {
      method: body ? 'POST' : 'DELETE',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new SyncError('offline')
  }
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
    throw new SyncError('redirect')
  if (response.ok) return response.status === 204 ? null : response.json()
  const code = await response
    .json()
    .then((value) => value?.error)
    .catch(() => null)
  if (SERVER_CODES.has(code))
    throw new SyncError(code, Number(response.headers.get('retry-after')) || undefined)
  // A server from before accounts answers 404 (or 401 for routes it does not know).
  if (response.status === 404 || (response.status === 401 && code === 'unauthorized'))
    throw new SyncError('no_accounts')
  throw new SyncError(response.status >= 500 ? 'server_error' : 'failed')
}

/**
 * New account with a new note key. Returns the session and the recovery key to show
 * once: it is optional, and it is the only way to reset a forgotten password.
 */
export async function signUp({ server, name, email, password, invite, fetch, iterations }) {
  email = normalizeEmail(email)
  name = String(name ?? '').trim()
  if (!name) throw new SyncError('bad_name')
  checkEmail(email)
  checkPassword(password)
  if (!String(invite ?? '').trim()) throw new SyncError('invalid_invite')
  const key = generateKeyBytes()
  const { authKey, wrapKey } = await accountKeys(email, password, iterations)
  const result = await post(
    server,
    '/v1/accounts',
    {
      name,
      email,
      invite,
      authKey,
      wrappedKey: await wrapNoteKey(wrapKey, key, email),
      recoveryAuth: await recoveryProof(key),
    },
    { fetch },
  )
  return { token: result.token, name: result.name, email, key, recovery: await recoveryKey(key) }
}

export async function signIn({ server, email, password, fetch, iterations }) {
  email = normalizeEmail(email)
  checkEmail(email)
  if (!password) throw new SyncError('invalid_login')
  const { authKey, wrapKey } = await accountKeys(email, password, iterations)
  const result = await post(server, '/v1/sessions', { email, authKey }, { fetch })
  let key
  try {
    key = await unwrapNoteKey(wrapKey, result.wrappedKey, email)
  } catch {
    throw new SyncError('invalid_login')
  }
  return { token: result.token, name: result.name, email, key }
}

/** Sets a new password with the recovery key; every other session of the account ends. */
export async function recoverAccount({ server, email, recovery, password, fetch, iterations }) {
  email = normalizeEmail(email)
  checkEmail(email)
  const key = await keyFromRecovery(recovery)
  if (!key) throw new SyncError('bad_recovery')
  checkPassword(password)
  const { authKey, wrapKey } = await accountKeys(email, password, iterations)
  const result = await post(
    server,
    '/v1/recover',
    {
      email,
      recoveryAuth: await recoveryProof(key),
      authKey,
      wrappedKey: await wrapNoteKey(wrapKey, key, email),
    },
    { fetch },
  )
  return { token: result.token, name: result.name, email, key }
}

/** Ends the session on the server. Failing is fine: the device forgets it anyway. */
export async function signOut({ server, token, fetch }) {
  try {
    await post(server, '/v1/sessions/current', null, { fetch, token })
  } catch {
    // Offline or already revoked.
  }
}
