// HTTP client for the sync contract (ADR 0018). Credentials never follow redirects,
// errors never carry the key or content, and a note PUT is never retried blindly.

export class SyncError extends Error {
  constructor(code, retryAfter) {
    super(code)
    this.name = 'SyncError'
    this.code = code
    this.retryAfter = retryAfter
  }
}

const TIMEOUT = 30_000

export function createClient({ server, token, fetch = globalThis.fetch }) {
  const base = new URL(server)
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname))
    throw new SyncError('insecure_server')
  const root = base.href.replace(/\/$/, '')

  async function request(path, init = {}) {
    let response
    try {
      response = await fetch(`${root}${path}`, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { authorization: `Bearer ${token}`, ...init.headers },
      })
    } catch {
      throw new SyncError('offline')
    }
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
      throw new SyncError('redirect')
    if (response.status === 429)
      throw new SyncError('rate_limited', Number(response.headers.get('retry-after')) || 60)
    if (response.status === 401) throw new SyncError('unauthorized')
    if (response.status === 507) throw new SyncError('quota_exceeded')
    return response
  }

  const failed = (response) =>
    new SyncError(response.status >= 500 ? 'server_error' : `http_${response.status}`)

  return {
    async changes(since) {
      const query = since ? `?since=${encodeURIComponent(since)}` : ''
      const response = await request(`/v1/changes${query}`)
      if (!response.ok) throw failed(response)
      return response.json()
    },
    async getNote(id) {
      const response = await request(`/v1/notes/${encodeURIComponent(id)}`)
      if (response.status === 404) return null
      if (!response.ok) throw failed(response)
      return response.json()
    },
    /** `revision` null creates; a 409 is returned as `{ conflict: true }`, not thrown. */
    async putNote(id, revision, body) {
      const response = await request(`/v1/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(revision === null ? { 'if-none-match': '*' } : { 'if-match': `"${revision}"` }),
        },
        body: JSON.stringify(body),
      })
      if (response.status === 409) return { conflict: true }
      if (!response.ok) throw failed(response)
      return response.json()
    },
    async getBlob(sha) {
      const response = await request(`/v1/blobs/${sha}`)
      if (response.status === 404) return null
      if (!response.ok) throw failed(response)
      return new Uint8Array(await response.arrayBuffer())
    },
    async putBlob(sha, bytes) {
      const response = await request(`/v1/blobs/${sha}`, { method: 'PUT', body: bytes })
      if (!response.ok) throw failed(response)
    },
  }
}
