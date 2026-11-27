// Client for shared spaces (ADR 0054): CRUD, invites, members, key rotation,
// and a per-space sync client compatible with `runSync`.
import { SyncError, serverRoot } from './client.js'
import { generateKeyBytes, unwrapSpaceKey, wrapSpaceKey } from './crypto.js'

const TIMEOUT = 30_000

async function apiRequest(server, token, path, { method = 'GET', body, headers = {}, fetch = globalThis.fetch } = {}) {
  const root = serverRoot(server)
  let response
  try {
    response = await fetch(`${root}${path}`, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT),
      headers: {
        authorization: `Bearer ${token}`,
        ...(body !== undefined && !(body instanceof Uint8Array)
          ? { 'content-type': 'application/json' }
          : {}),
        ...headers,
      },
      body:
        body === undefined
          ? undefined
          : body instanceof Uint8Array
            ? body
            : JSON.stringify(body),
    })
  } catch {
    throw new SyncError('offline')
  }
  if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400))
    throw new SyncError('redirect')
  if (response.status === 429)
    throw new SyncError('rate_limited', Number(response.headers.get('retry-after')) || 60)
  if (response.status === 401) throw new SyncError('unauthorized')
  if (response.status === 403) throw new SyncError('forbidden')
  if (response.status === 507) throw new SyncError('quota_exceeded')
  return response
}

async function parseJsonOrThrow(response) {
  if (response.status === 204) return null
  if (response.ok) return response.json()
  const code = await response
    .json()
    .then((v) => v?.error)
    .catch(() => null)
  throw new SyncError(code || (response.status >= 500 ? 'server_error' : `http_${response.status}`))
}

export function createSpacesClient({ server, token, fetch = globalThis.fetch }) {
  const call = (path, opts) => apiRequest(server, token, path, { ...opts, fetch })

  return {
    async listSpaces() {
      const data = await parseJsonOrThrow(await call('/v1/spaces'))
      return data.spaces ?? []
    },
    async getSpace(spaceId) {
      return parseJsonOrThrow(await call(`/v1/spaces/${encodeURIComponent(spaceId)}`))
    },
    async createSpace({ name, ownerPublicKey }) {
      const spaceKey = generateKeyBytes()
      const wrappedSpaceKey = await wrapSpaceKey(spaceKey, ownerPublicKey)
      const created = await parseJsonOrThrow(
        await call('/v1/spaces', {
          method: 'POST',
          body: { name, wrappedSpaceKey },
        }),
      )
      return { ...created, spaceKey }
    },
    async renameSpace(spaceId, name) {
      return parseJsonOrThrow(
        await call(`/v1/spaces/${encodeURIComponent(spaceId)}`, {
          method: 'PATCH',
          body: { name },
        }),
      )
    },
    async deleteSpace(spaceId) {
      return parseJsonOrThrow(
        await call(`/v1/spaces/${encodeURIComponent(spaceId)}`, { method: 'DELETE' }),
      )
    },
    async leaveSpace(spaceId) {
      return parseJsonOrThrow(
        await call(`/v1/spaces/${encodeURIComponent(spaceId)}/leave`, { method: 'POST' }),
      )
    },
    async lookupAccount(email) {
      const response = await call(`/v1/accounts/lookup?email=${encodeURIComponent(email)}`)
      if (response.status === 404) return null
      return parseJsonOrThrow(response)
    },
    async inviteMember({ spaceId, email, role, spaceKey }) {
      const target = await this.lookupAccount(email)
      if (!target) throw new SyncError('account_not_found')
      if (!target.publicKey) throw new SyncError('recipient_no_keys')
      const wrappedSpaceKey = await wrapSpaceKey(spaceKey, target.publicKey)
      return parseJsonOrThrow(
        await call(`/v1/spaces/${encodeURIComponent(spaceId)}/invites`, {
          method: 'POST',
          body: { email: target.email, role, wrappedSpaceKey },
        }),
      )
    },
    async listInvites() {
      const data = await parseJsonOrThrow(await call('/v1/spaces/invites'))
      return data.invites ?? []
    },
    async acceptInvite(inviteId) {
      return parseJsonOrThrow(
        await call(`/v1/spaces/invites/${encodeURIComponent(inviteId)}/accept`, {
          method: 'POST',
        }),
      )
    },
    async declineInvite(inviteId) {
      return parseJsonOrThrow(
        await call(`/v1/spaces/invites/${encodeURIComponent(inviteId)}/decline`, {
          method: 'POST',
        }),
      )
    },
    async cancelInvite(spaceId, inviteId) {
      return parseJsonOrThrow(
        await call(
          `/v1/spaces/${encodeURIComponent(spaceId)}/invites/${encodeURIComponent(inviteId)}`,
          { method: 'DELETE' },
        ),
      )
    },
    async updateMemberRole(spaceId, accountId, role) {
      return parseJsonOrThrow(
        await call(
          `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(accountId)}`,
          { method: 'PATCH', body: { role } },
        ),
      )
    },
    async removeMember(spaceId, accountId) {
      return parseJsonOrThrow(
        await call(
          `/v1/spaces/${encodeURIComponent(spaceId)}/members/${encodeURIComponent(accountId)}`,
          { method: 'DELETE' },
        ),
      )
    },
    async rotateSpaceKey(spaceId, members) {
      const newSpaceKey = generateKeyBytes()
      const keys = {}
      for (const member of members) {
        if (!member.publicKey) continue
        keys[member.accountId] = await wrapSpaceKey(newSpaceKey, member.publicKey)
      }
      const res = await parseJsonOrThrow(
        await call(`/v1/spaces/${encodeURIComponent(spaceId)}/rotate-key`, {
          method: 'POST',
          body: { keys },
        }),
      )
      return { keyVersion: res.keyVersion, spaceKey: newSpaceKey }
    },
    async unwrapKey(wrappedSpaceKey, privateKeyPkcs8) {
      return unwrapSpaceKey(wrappedSpaceKey, privateKeyPkcs8)
    },
  }
}

/** Per-space sync client with the exact same interface as `createClient` for `runSync`. */
export function createSpaceSyncClient({ server, token, spaceId, fetch = globalThis.fetch }) {
  const base = `/v1/spaces/${encodeURIComponent(spaceId)}`
  const call = (path, opts) => apiRequest(server, token, `${base}${path}`, { ...opts, fetch })

  return {
    async changes(since) {
      const query = since ? `?since=${encodeURIComponent(since)}` : ''
      return parseJsonOrThrow(await call(`/changes${query}`))
    },
    async getNote(id) {
      const response = await call(`/notes/${encodeURIComponent(id)}`)
      if (response.status === 404) return null
      return parseJsonOrThrow(response)
    },
    async putNote(id, revision, body) {
      const response = await call(`/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          ...(revision === null ? { 'if-none-match': '*' } : { 'if-match': `"${revision}"` }),
        },
        body,
      })
      if (response.status === 409) return { conflict: true }
      return parseJsonOrThrow(response)
    },
    async getBlob(sha) {
      const response = await call(`/blobs/${sha}`)
      if (response.status === 404) return null
      if (!response.ok) throw new SyncError(`http_${response.status}`)
      return new Uint8Array(await response.arrayBuffer())
    },
    async putBlob(sha, bytes) {
      const response = await call(`/blobs/${sha}`, { method: 'PUT', body: bytes })
      if (!response.ok) throw new SyncError(`http_${response.status}`)
    },
  }
}
