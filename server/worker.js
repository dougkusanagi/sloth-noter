import { createApi, rateLimiter, sha256Hex } from './api.js'
import { createServer, d1Directory, keyedLimiter } from './accounts.js'
import { cloudflareStore } from './cloudflare-store.js'
import { ACCOUNT_TABLES, SHARED_SPACE_TABLES, profileStore } from './profile-store.js'
import { d1Spaces } from './spaces.js'

// The limiters live per isolate: they slow a runaway client or repeated password
// guesses; they are not a hard quota.
let limit
let attempts

/**
 * Credentials from before accounts (ADR 0023): profile space keys and SYNC_TOKEN.
 * They keep working until the administrator revokes them (README, "Desligar as chaves antigas").
 */
async function legacy(request, env) {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return null
  const hash = await sha256Hex(new TextEncoder().encode(token))
  const space = await env.DB.prepare(
    'SELECT id FROM profile_spaces WHERE credential_hash = ? AND revoked_at IS NULL',
  )
    .bind(hash)
    .first()
  if (space)
    return createApi({ store: profileStore(env.DB, env.BLOBS, space.id), token, limit })(request)
  if (env.SYNC_TOKEN && token === env.SYNC_TOKEN)
    return createApi({ store: cloudflareStore(env.DB, env.BLOBS), token, limit })(request)
  return null
}

export default {
  async fetch(request, env) {
    limit ??= rateLimiter({ limit: Number(env.RATE_LIMIT ?? 600), windowMs: 60_000 })
    attempts ??= keyedLimiter()
    return createServer({
      directory: d1Directory(env.DB),
      storeFor: (account) => profileStore(env.DB, env.BLOBS, account, { tables: ACCOUNT_TABLES }),
      spaces: d1Spaces(env.DB),
      spaceStoreFor: (spaceId) =>
        profileStore(env.DB, env.BLOBS, spaceId, { tables: SHARED_SPACE_TABLES }),
      legacy: (req) => legacy(req, env),
      limit,
      attempts,
    })(request)
  },
}
