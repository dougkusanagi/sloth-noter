// Shared spaces between accounts (ADR 0054).
// Access levels: owner, editor, viewer. Viewers are refused writes on the server (403).
import { CORS, createApi } from './api.js'

const ID = /^[A-Za-z0-9_-]{1,64}$/
const ROLES = new Set(['editor', 'viewer'])
const MAX_BODY = 16_384
const MAX_SPACE_NAME = 80
const MAX_WRAPPED = 2048

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  })
const fail = (status, code) => json(status, { error: code })

async function readJson(request) {
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

function validWrapped(value) {
  return typeof value === 'string' && value.length >= 20 && value.length <= MAX_WRAPPED
}

function validPublicKey(value) {
  return typeof value === 'string' && value.length >= 40 && value.length <= MAX_WRAPPED
}

/**
 * Handles `/v1/accounts/me/keys`, `/v1/accounts/lookup`, and `/v1/spaces/...`
 * for an authenticated account. Returns a Response or null if the path does not match.
 */
export async function routeSpaces({
  request,
  accountId,
  directory,
  spaces,
  spaceStoreFor,
  token,
  limit,
  normalizeEmail,
}) {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] !== 'v1') return null

  // Account key pair registration / migration (P2)
  if (parts[1] === 'accounts' && parts[2] === 'me' && parts[3] === 'keys' && parts.length === 4) {
    if (request.method !== 'PUT') return fail(405, 'method_not_allowed')
    const body = await readJson(request)
    if (!body || !validPublicKey(body.publicKey) || !validWrapped(body.wrappedPrivateKey))
      return fail(400, 'bad_request')
    await directory.updateAccountKeys(accountId, {
      publicKey: body.publicKey,
      wrappedPrivateKey: body.wrappedPrivateKey,
    })
    return json(200, { ok: true })
  }

  // Lookup another account's public key by e-mail to send a space invite (P3)
  if (parts[1] === 'accounts' && parts[2] === 'lookup' && parts.length === 3) {
    if (request.method !== 'GET') return fail(405, 'method_not_allowed')
    const email = normalizeEmail(url.searchParams.get('email'))
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'bad_request')
    const target = await directory.findAccount(email)
    if (!target) return fail(404, 'not_found')
    return json(200, {
      id: target.id,
      name: target.name,
      email: target.email ?? email,
      publicKey: target.publicKey ?? null,
    })
  }

  if (parts[1] !== 'spaces') return null
  if (!spaces) return fail(404, 'not_found')

  // GET /v1/spaces — list spaces the account belongs to
  // POST /v1/spaces — create a new shared space
  if (parts.length === 2) {
    if (request.method === 'GET') {
      const list = await spaces.listSpaces(accountId)
      return json(200, { spaces: list })
    }
    if (request.method === 'POST') {
      const body = await readJson(request)
      const name = String(body?.name ?? '').trim()
      if (!name || name.length > MAX_SPACE_NAME || !validWrapped(body?.wrappedSpaceKey))
        return fail(400, 'bad_request')
      const id = crypto.randomUUID()
      const created = await spaces.createSpace({
        id,
        name,
        ownerId: accountId,
        wrappedSpaceKey: body.wrappedSpaceKey,
      })
      return json(201, created)
    }
    return fail(405, 'method_not_allowed')
  }

  // Invites received by the current account:
  // GET /v1/spaces/invites
  // POST /v1/spaces/invites/:inviteId/accept
  // POST /v1/spaces/invites/:inviteId/decline
  if (parts[2] === 'invites') {
    if (parts.length === 3 && request.method === 'GET') {
      const invites = await spaces.listInvitesForAccount(accountId)
      return json(200, { invites })
    }
    if (parts.length === 5 && request.method === 'POST') {
      const inviteId = parts[3]
      const action = parts[4]
      if (!ID.test(inviteId)) return fail(400, 'bad_request')
      if (action === 'accept') {
        const result = await spaces.acceptInvite(inviteId, accountId)
        if (!result) return fail(404, 'not_found')
        return json(200, result)
      }
      if (action === 'decline') {
        const ok = await spaces.declineInvite(inviteId, accountId)
        if (!ok) return fail(404, 'not_found')
        return new Response(null, { status: 204, headers: CORS })
      }
    }
    return fail(404, 'not_found')
  }

  const spaceId = parts[2]
  if (!ID.test(spaceId)) return fail(400, 'bad_request')

  const member = await spaces.getMember(spaceId, accountId)
  if (!member) return fail(403, 'forbidden')

  // /v1/spaces/:spaceId
  if (parts.length === 3) {
    if (request.method === 'GET') {
      const detail = await spaces.getSpace(spaceId, accountId)
      if (!detail) return fail(404, 'not_found')
      return json(200, detail)
    }
    if (request.method === 'PATCH') {
      if (member.role !== 'owner') return fail(403, 'forbidden')
      const body = await readJson(request)
      const name = String(body?.name ?? '').trim()
      if (!name || name.length > MAX_SPACE_NAME) return fail(400, 'bad_request')
      await spaces.renameSpace(spaceId, name)
      return json(200, { id: spaceId, name })
    }
    if (request.method === 'DELETE') {
      if (member.role !== 'owner') return fail(403, 'forbidden')
      await spaces.deleteSpace(spaceId)
      return new Response(null, { status: 204, headers: CORS })
    }
    return fail(405, 'method_not_allowed')
  }

  // POST /v1/spaces/:spaceId/leave
  if (parts.length === 4 && parts[3] === 'leave' && request.method === 'POST') {
    if (member.role === 'owner') return fail(400, 'owner_cannot_leave')
    await spaces.removeMember(spaceId, accountId)
    return new Response(null, { status: 204, headers: CORS })
  }

  // POST /v1/spaces/:spaceId/rotate-key
  if (parts.length === 4 && parts[3] === 'rotate-key' && request.method === 'POST') {
    if (member.role !== 'owner') return fail(403, 'forbidden')
    const body = await readJson(request)
    if (!body?.keys || typeof body.keys !== 'object' || Array.isArray(body.keys))
      return fail(400, 'bad_request')
    for (const [accId, wrapped] of Object.entries(body.keys)) {
      if (!ID.test(accId) || !validWrapped(wrapped)) return fail(400, 'bad_request')
    }
    const keyVersion = await spaces.rotateSpaceKey(spaceId, body.keys)
    return json(200, { keyVersion })
  }

  // POST /v1/spaces/:spaceId/invites
  if (parts.length === 4 && parts[3] === 'invites' && request.method === 'POST') {
    if (member.role !== 'owner') return fail(403, 'forbidden')
    const body = await readJson(request)
    const email = normalizeEmail(body?.email)
    const role = body?.role
    if (
      !body ||
      !email ||
      !ROLES.has(role) ||
      !validWrapped(body.wrappedSpaceKey)
    )
      return fail(400, 'bad_request')
    const target = await directory.findAccount(email)
    if (!target) return fail(404, 'account_not_found')
    if (target.id === accountId) return fail(400, 'cannot_invite_self')
    const existing = await spaces.getMember(spaceId, target.id)
    if (existing) return fail(409, 'already_member')
    const invite = await spaces.createInvite({
      id: crypto.randomUUID(),
      spaceId,
      inviterId: accountId,
      inviteeId: target.id,
      role,
      wrappedSpaceKey: body.wrappedSpaceKey,
    })
    return json(201, invite)
  }

  // DELETE /v1/spaces/:spaceId/invites/:inviteId
  if (parts.length === 5 && parts[3] === 'invites' && request.method === 'DELETE') {
    if (member.role !== 'owner') return fail(403, 'forbidden')
    const ok = await spaces.cancelInvite(spaceId, parts[4])
    if (!ok) return fail(404, 'not_found')
    return new Response(null, { status: 204, headers: CORS })
  }

  // PATCH / DELETE /v1/spaces/:spaceId/members/:targetAccountId
  if (parts.length === 5 && parts[3] === 'members') {
    const targetId = parts[4]
    if (!ID.test(targetId)) return fail(400, 'bad_request')
    if (request.method === 'PATCH') {
      if (member.role !== 'owner') return fail(403, 'forbidden')
      if (targetId === accountId) return fail(400, 'cannot_change_owner')
      const body = await readJson(request)
      if (!body || !ROLES.has(body.role)) return fail(400, 'bad_request')
      const ok = await spaces.updateMemberRole(spaceId, targetId, body.role)
      if (!ok) return fail(404, 'not_found')
      return json(200, { accountId: targetId, role: body.role })
    }
    if (request.method === 'DELETE') {
      if (targetId === accountId) {
        if (member.role === 'owner') return fail(400, 'owner_cannot_leave')
        await spaces.removeMember(spaceId, accountId)
        return new Response(null, { status: 204, headers: CORS })
      }
      if (member.role !== 'owner') return fail(403, 'forbidden')
      const ok = await spaces.removeMember(spaceId, targetId)
      if (!ok) return fail(404, 'not_found')
      return new Response(null, { status: 204, headers: CORS })
    }
    return fail(405, 'method_not_allowed')
  }

  // Data sync routes for the space:
  // GET /v1/spaces/:spaceId/changes
  // GET|PUT /v1/spaces/:spaceId/notes/:id
  // GET|PUT /v1/spaces/:spaceId/blobs/:sha
  const resource = parts[3]
  if (resource === 'changes' || resource === 'notes' || resource === 'blobs') {
    if (request.method === 'PUT' && member.role === 'viewer') {
      return fail(403, 'forbidden')
    }
    if (!spaceStoreFor) return fail(500, 'server_error')
    const rewrittenUrl = new URL(request.url)
    rewrittenUrl.pathname = `/v1/${parts.slice(3).join('/')}`
    const forwarded = new Request(rewrittenUrl.toString(), request)
    return createApi({ store: spaceStoreFor(spaceId), token, limit })(forwarded)
  }

  return fail(404, 'not_found')
}

/** D1 implementation of shared spaces storage. */
export function d1Spaces(db) {
  return {
    async listSpaces(accountId) {
      const { results } = await db
        .prepare(
          `SELECT s.id, s.name, s.owner_id, s.key_version, m.role, m.wrapped_space_key,
                  (SELECT COUNT(*) FROM space_members sm WHERE sm.space_id = s.id) AS member_count
           FROM space_members m
           JOIN spaces s ON s.id = m.space_id
           WHERE m.account_id = ?
           ORDER BY s.created_at ASC`,
        )
        .bind(accountId)
        .all()
      return results.map((row) => ({
        id: row.id,
        name: row.name,
        ownerId: row.owner_id,
        keyVersion: row.key_version,
        role: row.role,
        wrappedSpaceKey: row.wrapped_space_key,
        memberCount: row.member_count,
      }))
    },
    async createSpace({ id, name, ownerId, wrappedSpaceKey }) {
      await db.batch([
        db
          .prepare('INSERT INTO spaces (id, name, owner_id, key_version) VALUES (?1, ?2, ?3, 1)')
          .bind(id, name, ownerId),
        db
          .prepare(
            `INSERT INTO space_members (space_id, account_id, role, wrapped_space_key)
             VALUES (?1, ?2, 'owner', ?3)`,
          )
          .bind(id, ownerId, wrappedSpaceKey),
      ])
      return { id, name, ownerId, keyVersion: 1, role: 'owner', wrappedSpaceKey, memberCount: 1 }
    },
    async getMember(spaceId, accountId) {
      const row = await db
        .prepare(
          'SELECT role, wrapped_space_key FROM space_members WHERE space_id = ? AND account_id = ?',
        )
        .bind(spaceId, accountId)
        .first()
      return row ? { role: row.role, wrappedSpaceKey: row.wrapped_space_key } : null
    },
    async getSpace(spaceId, accountId) {
      const space = await db
        .prepare('SELECT id, name, owner_id, key_version FROM spaces WHERE id = ?')
        .bind(spaceId)
        .first()
      if (!space) return null
      const member = await this.getMember(spaceId, accountId)
      if (!member) return null
      const { results: memberRows } = await db
        .prepare(
          `SELECT m.account_id, m.role, a.name, a.email, a.public_key
           FROM space_members m
           JOIN accounts a ON a.id = m.account_id
           WHERE m.space_id = ?
           ORDER BY m.joined_at ASC`,
        )
        .bind(spaceId)
        .all()
      let invites = []
      if (member.role === 'owner') {
        const { results: inviteRows } = await db
          .prepare(
            `SELECT i.id, i.role, i.created_at, a.id AS account_id, a.name, a.email
             FROM space_invites i
             JOIN accounts a ON a.id = i.invitee_id
             WHERE i.space_id = ?
             ORDER BY i.created_at ASC`,
          )
          .bind(spaceId)
          .all()
        invites = inviteRows.map((row) => ({
          id: row.id,
          role: row.role,
          accountId: row.account_id,
          name: row.name,
          email: row.email,
          createdAt: row.created_at,
        }))
      }
      return {
        id: space.id,
        name: space.name,
        ownerId: space.owner_id,
        keyVersion: space.key_version,
        role: member.role,
        wrappedSpaceKey: member.wrappedSpaceKey,
        members: memberRows.map((row) => ({
          accountId: row.account_id,
          role: row.role,
          name: row.name,
          email: row.email,
          publicKey: row.public_key ?? null,
        })),
        invites,
      }
    },
    async renameSpace(spaceId, name) {
      await db.prepare('UPDATE spaces SET name = ? WHERE id = ?').bind(name, spaceId).run()
    },
    async deleteSpace(spaceId) {
      await db.batch([
        db.prepare('DELETE FROM shared_space_notes WHERE space_id = ?').bind(spaceId),
        db.prepare('DELETE FROM shared_space_blob_sizes WHERE space_id = ?').bind(spaceId),
        db.prepare('DELETE FROM space_invites WHERE space_id = ?').bind(spaceId),
        db.prepare('DELETE FROM space_members WHERE space_id = ?').bind(spaceId),
        db.prepare('DELETE FROM spaces WHERE id = ?').bind(spaceId),
      ])
    },
    async createInvite({ id, spaceId, inviterId, inviteeId, role, wrappedSpaceKey }) {
      await db
        .prepare(
          `INSERT INTO space_invites (id, space_id, inviter_id, invitee_id, role, wrapped_space_key)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)
           ON CONFLICT(space_id, invitee_id) DO UPDATE SET
             id = excluded.id,
             inviter_id = excluded.inviter_id,
             role = excluded.role,
             wrapped_space_key = excluded.wrapped_space_key,
             created_at = CURRENT_TIMESTAMP`,
        )
        .bind(id, spaceId, inviterId, inviteeId, role, wrappedSpaceKey)
        .run()
      return { id, spaceId, inviteeId, role }
    },
    async listInvitesForAccount(accountId) {
      const { results } = await db
        .prepare(
          `SELECT i.id, i.space_id, i.role, i.wrapped_space_key, i.created_at,
                  s.name AS space_name, a.name AS inviter_name, a.email AS inviter_email
           FROM space_invites i
           JOIN spaces s ON s.id = i.space_id
           JOIN accounts a ON a.id = i.inviter_id
           WHERE i.invitee_id = ?
           ORDER BY i.created_at DESC`,
        )
        .bind(accountId)
        .all()
      return results.map((row) => ({
        id: row.id,
        spaceId: row.space_id,
        spaceName: row.space_name,
        inviterName: row.inviter_name,
        inviterEmail: row.inviter_email,
        role: row.role,
        wrappedSpaceKey: row.wrapped_space_key,
        createdAt: row.created_at,
      }))
    },
    async acceptInvite(inviteId, accountId) {
      const invite = await db
        .prepare(
          'SELECT id, space_id, role, wrapped_space_key FROM space_invites WHERE id = ? AND invitee_id = ?',
        )
        .bind(inviteId, accountId)
        .first()
      if (!invite) return null
      await db.batch([
        db
          .prepare(
            `INSERT OR REPLACE INTO space_members (space_id, account_id, role, wrapped_space_key)
             VALUES (?1, ?2, ?3, ?4)`,
          )
          .bind(invite.space_id, accountId, invite.role, invite.wrapped_space_key),
        db.prepare('DELETE FROM space_invites WHERE id = ?').bind(inviteId),
      ])
      const space = await db
        .prepare('SELECT id, name, owner_id, key_version FROM spaces WHERE id = ?')
        .bind(invite.space_id)
        .first()
      return {
        id: space.id,
        name: space.name,
        ownerId: space.owner_id,
        keyVersion: space.key_version,
        role: invite.role,
        wrappedSpaceKey: invite.wrapped_space_key,
      }
    },
    async declineInvite(inviteId, accountId) {
      const result = await db
        .prepare('DELETE FROM space_invites WHERE id = ? AND invitee_id = ?')
        .bind(inviteId, accountId)
        .run()
      return Boolean(result.meta.changes)
    },
    async cancelInvite(spaceId, inviteId) {
      const result = await db
        .prepare('DELETE FROM space_invites WHERE id = ? AND space_id = ?')
        .bind(inviteId, spaceId)
        .run()
      return Boolean(result.meta.changes)
    },
    async updateMemberRole(spaceId, memberAccountId, role) {
      const result = await db
        .prepare(
          `UPDATE space_members SET role = ? WHERE space_id = ? AND account_id = ? AND role != 'owner'`,
        )
        .bind(role, spaceId, memberAccountId)
        .run()
      return Boolean(result.meta.changes)
    },
    async removeMember(spaceId, memberAccountId) {
      const result = await db
        .prepare(
          `DELETE FROM space_members WHERE space_id = ? AND account_id = ? AND role != 'owner'`,
        )
        .bind(spaceId, memberAccountId)
        .run()
      return Boolean(result.meta.changes)
    },
    async rotateSpaceKey(spaceId, wrappedKeysByAccountId) {
      const statements = [
        db
          .prepare('UPDATE spaces SET key_version = key_version + 1 WHERE id = ?')
          .bind(spaceId),
      ]
      for (const [accId, wrapped] of Object.entries(wrappedKeysByAccountId)) {
        statements.push(
          db
            .prepare(
              'UPDATE space_members SET wrapped_space_key = ? WHERE space_id = ? AND account_id = ?',
            )
            .bind(wrapped, spaceId, accId),
        )
      }
      await db.batch(statements)
      const row = await db
        .prepare('SELECT key_version FROM spaces WHERE id = ?')
        .bind(spaceId)
        .first()
      return row?.key_version ?? 1
    },
  }
}

/** In-memory shared spaces store with the same contract, for tests. */
export function memorySpaces(directory) {
  const spaces = new Map()
  const members = new Map() // spaceId -> Map(accountId -> { role, wrappedSpaceKey })
  const invites = new Map() // inviteId -> { id, spaceId, inviterId, inviteeId, role, wrappedSpaceKey, createdAt }

  return {
    async listSpaces(accountId) {
      const out = []
      for (const [spaceId, space] of spaces) {
        const spaceMembers = members.get(spaceId)
        const m = spaceMembers?.get(accountId)
        if (!m) continue
        out.push({
          id: space.id,
          name: space.name,
          ownerId: space.ownerId,
          keyVersion: space.keyVersion,
          role: m.role,
          wrappedSpaceKey: m.wrappedSpaceKey,
          memberCount: spaceMembers.size,
        })
      }
      return out
    },
    async createSpace({ id, name, ownerId, wrappedSpaceKey }) {
      const space = { id, name, ownerId, keyVersion: 1 }
      spaces.set(id, space)
      members.set(id, new Map([[ownerId, { role: 'owner', wrappedSpaceKey }]]))
      return { ...space, role: 'owner', wrappedSpaceKey, memberCount: 1 }
    },
    async getMember(spaceId, accountId) {
      return members.get(spaceId)?.get(accountId) ?? null
    },
    async getSpace(spaceId, accountId) {
      const space = spaces.get(spaceId)
      if (!space) return null
      const spaceMembers = members.get(spaceId)
      const member = spaceMembers?.get(accountId)
      if (!member) return null
      const memberList = []
      for (const [accId, m] of spaceMembers) {
        const acc = await directory.findAccountById?.(accId)
        memberList.push({
          accountId: accId,
          role: m.role,
          name: acc?.name ?? '',
          email: acc?.email ?? '',
          publicKey: acc?.publicKey ?? null,
        })
      }
      const inviteList = []
      if (member.role === 'owner') {
        for (const inv of invites.values()) {
          if (inv.spaceId !== spaceId) continue
          const acc = await directory.findAccountById?.(inv.inviteeId)
          inviteList.push({
            id: inv.id,
            role: inv.role,
            accountId: inv.inviteeId,
            name: acc?.name ?? '',
            email: acc?.email ?? '',
            createdAt: inv.createdAt,
          })
        }
      }
      return {
        ...space,
        role: member.role,
        wrappedSpaceKey: member.wrappedSpaceKey,
        members: memberList,
        invites: inviteList,
      }
    },
    async renameSpace(spaceId, name) {
      const space = spaces.get(spaceId)
      if (space) space.name = name
    },
    async deleteSpace(spaceId) {
      spaces.delete(spaceId)
      members.delete(spaceId)
      for (const [id, inv] of invites) {
        if (inv.spaceId === spaceId) invites.delete(id)
      }
    },
    async createInvite({ id, spaceId, inviterId, inviteeId, role, wrappedSpaceKey }) {
      for (const [existingId, inv] of invites) {
        if (inv.spaceId === spaceId && inv.inviteeId === inviteeId) invites.delete(existingId)
      }
      const entry = {
        id,
        spaceId,
        inviterId,
        inviteeId,
        role,
        wrappedSpaceKey,
        createdAt: new Date().toISOString(),
      }
      invites.set(id, entry)
      return { id, spaceId, inviteeId, role }
    },
    async listInvitesForAccount(accountId) {
      const out = []
      for (const inv of invites.values()) {
        if (inv.inviteeId !== accountId) continue
        const space = spaces.get(inv.spaceId)
        const inviter = await directory.findAccountById?.(inv.inviterId)
        out.push({
          id: inv.id,
          spaceId: inv.spaceId,
          spaceName: space?.name ?? '',
          inviterName: inviter?.name ?? '',
          inviterEmail: inviter?.email ?? '',
          role: inv.role,
          wrappedSpaceKey: inv.wrappedSpaceKey,
          createdAt: inv.createdAt,
        })
      }
      return out
    },
    async acceptInvite(inviteId, accountId) {
      const inv = invites.get(inviteId)
      if (!inv || inv.inviteeId !== accountId) return null
      const space = spaces.get(inv.spaceId)
      if (!space) return null
      members.get(inv.spaceId)?.set(accountId, {
        role: inv.role,
        wrappedSpaceKey: inv.wrappedSpaceKey,
      })
      invites.delete(inviteId)
      return {
        ...space,
        role: inv.role,
        wrappedSpaceKey: inv.wrappedSpaceKey,
      }
    },
    async declineInvite(inviteId, accountId) {
      const inv = invites.get(inviteId)
      if (!inv || inv.inviteeId !== accountId) return false
      invites.delete(inviteId)
      return true
    },
    async cancelInvite(spaceId, inviteId) {
      const inv = invites.get(inviteId)
      if (!inv || inv.spaceId !== spaceId) return false
      invites.delete(inviteId)
      return true
    },
    async updateMemberRole(spaceId, memberAccountId, role) {
      const m = members.get(spaceId)?.get(memberAccountId)
      if (!m || m.role === 'owner') return false
      m.role = role
      return true
    },
    async removeMember(spaceId, memberAccountId) {
      const spaceMembers = members.get(spaceId)
      const m = spaceMembers?.get(memberAccountId)
      if (!m || m.role === 'owner') return false
      spaceMembers.delete(memberAccountId)
      return true
    },
    async rotateSpaceKey(spaceId, wrappedKeysByAccountId) {
      const space = spaces.get(spaceId)
      if (!space) return 1
      space.keyVersion += 1
      const spaceMembers = members.get(spaceId)
      for (const [accId, wrapped] of Object.entries(wrappedKeysByAccountId)) {
        const m = spaceMembers?.get(accId)
        if (m) m.wrappedSpaceKey = wrapped
      }
      return space.keyVersion
    },
  }
}
