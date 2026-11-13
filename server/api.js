// Sync API from ADR 0018. Storage-agnostic: the Worker (S2) passes a D1/R2 store,
// tests pass the in-memory store. The server only sees opaque encrypted envelopes.

const ID = /^[A-Za-z0-9_-]{1,64}$/
const SHA256 = /^[0-9a-f]{64}$/
// D1 caps a row at 2 MB; images travel as blobs, not inside the note.
const MAX_ENVELOPE = 1_500_000
const MAX_BLOB = 20 * 1024 * 1024
const PAGE = 100

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
const error = (status, code, headers) => json(status, { error: code }, headers)

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function sameSecret(given, expected) {
  if (typeof given !== 'string' || given.length !== expected.length) return false
  let diff = 0
  for (let index = 0; index < expected.length; index++)
    diff |= given.charCodeAt(index) ^ expected.charCodeAt(index)
  return diff === 0
}

/** Fixed-window limiter per handler; `now` is injectable for tests. */
export function rateLimiter({ limit, windowMs, now = () => Date.now() }) {
  let start = now()
  let count = 0
  return () => {
    const time = now()
    if (time - start >= windowMs) {
      start = time
      count = 0
    }
    if (++count <= limit) return 0
    return Math.max(1, Math.ceil((start + windowMs - time) / 1000))
  }
}

const revisionTag = (revision) => `"${revision}"`
const parseTag = (value) => {
  const match = /^"(\d+)"$/.exec(value?.trim() ?? '')
  return match ? Number(match[1]) : null
}

function validNoteBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  if (typeof body.deleted !== 'boolean') return false
  if (typeof body.hash !== 'string' || !SHA256.test(body.hash)) return false
  if (body.deleted) return body.envelope === null
  return (
    typeof body.envelope === 'string' &&
    body.envelope.length > 0 &&
    body.envelope.length <= MAX_ENVELOPE &&
    /^[A-Za-z0-9+/=_-]+$/.test(body.envelope)
  )
}

export function createApi({ store, token, limit = () => 0 }) {
  if (typeof token !== 'string' || token.length < 32)
    throw new Error('The sync token must have at least 32 characters.')

  async function route(request) {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    if (parts[0] !== 'v1') return error(404, 'not_found')

    if (parts[1] === 'changes' && parts.length === 2 && request.method === 'GET') {
      const since = url.searchParams.get('since')
      const after = since ? store.parseCursor(since) : 0
      if (after === null) return error(400, 'bad_request')
      const page = await store.changes(after, PAGE)
      return json(200, {
        cursor: store.formatCursor(page.last ?? after),
        changes: page.changes,
        hasMore: page.hasMore,
      })
    }

    if (parts[1] === 'notes' && parts.length === 3) {
      const id = parts[2]
      if (!ID.test(id)) return error(400, 'bad_request')
      if (request.method === 'GET') {
        const note = await store.getNote(id)
        if (!note) return error(404, 'not_found')
        return json(200, note, { etag: revisionTag(note.revision) })
      }
      if (request.method === 'PUT') {
        const ifMatch = request.headers.get('if-match')
        const create = request.headers.get('if-none-match')?.trim() === '*'
        if (!ifMatch && !create) return error(428, 'precondition_required')
        const expected = create ? null : parseTag(ifMatch)
        if (!create && expected === null) return error(400, 'bad_request')
        const size = Number(request.headers.get('content-length') ?? 0)
        if (size > MAX_ENVELOPE + 1024) return error(413, 'too_large')
        let body
        try {
          body = await request.json()
        } catch {
          return error(400, 'bad_request')
        }
        if (!validNoteBody(body)) return error(400, 'bad_request')
        const result = await store.putNote(id, expected, {
          hash: body.hash,
          deleted: body.deleted,
          envelope: body.envelope,
        })
        if (!result.ok) return error(409, 'conflict')
        return json(200, { id, revision: result.revision }, { etag: revisionTag(result.revision) })
      }
    }

    if (parts[1] === 'blobs' && parts.length === 3) {
      const sha = parts[2]
      if (!SHA256.test(sha)) return error(400, 'bad_request')
      if (request.method === 'GET') {
        const blob = await store.getBlob(sha)
        if (!blob) return error(404, 'not_found')
        return new Response(blob, { headers: { 'content-type': 'application/octet-stream' } })
      }
      if (request.method === 'PUT') {
        if (Number(request.headers.get('content-length') ?? 0) > MAX_BLOB)
          return error(413, 'too_large')
        const bytes = new Uint8Array(await request.arrayBuffer())
        if (!bytes.length || bytes.length > MAX_BLOB) return error(400, 'bad_request')
        // The store checks the hash before confirming (R2 does it natively).
        const result = await store.putBlob(sha, bytes)
        if (result === 'mismatch') return error(400, 'hash_mismatch')
        return new Response(null, { status: result === 'created' ? 201 : 204 })
      }
    }
    return error(404, 'not_found')
  }

  // The app calls from its own origin (tauri://, http://tauri.localhost, the browser).
  // Auth is a Bearer header, never a cookie, so any origin may call with it.
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT',
    'access-control-allow-headers': 'authorization, content-type, if-match, if-none-match',
    'access-control-expose-headers': 'etag, retry-after',
    'access-control-max-age': '86400',
  }
  const withCors = (response) => {
    const headers = new Headers(response.headers)
    for (const [name, value] of Object.entries(CORS)) headers.set(name, value)
    return new Response(response.body, { status: response.status, headers })
  }

  return async function handle(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    return withCors(await authorized(request))
  }

  async function authorized(request) {
    const header = request.headers.get('authorization') ?? ''
    if (!header.startsWith('Bearer ') || !sameSecret(header.slice(7), token))
      return error(401, 'unauthorized')
    const wait = limit()
    if (wait) return error(429, 'rate_limited', { 'retry-after': String(wait) })
    try {
      return await route(request)
    } catch (failure) {
      // The store stopped before the free tier ran out; nothing was written.
      if (failure?.name === 'QuotaExceeded') return error(507, 'quota_exceeded')
      // Never echo the key, the content or the internal error.
      return error(500, 'server_error')
    }
  }
}
