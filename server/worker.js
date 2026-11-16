import { createApi, rateLimiter, sha256Hex } from './api.js'
import { cloudflareStore } from './cloudflare-store.js'
import { profileStore } from './profile-store.js'

// The limiter lives per isolate: it slows a runaway client, it is not a hard quota.
let limit

export default {
  async fetch(request, env) {
    limit ??= rateLimiter({ limit: Number(env.RATE_LIMIT ?? 600), windowMs: 60_000 })
    const header = request.headers.get('authorization') ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    let space = null
    if (token && token !== env.SYNC_TOKEN) {
      const hash = await sha256Hex(new TextEncoder().encode(token))
      space = await env.DB.prepare(
        'SELECT id FROM profile_spaces WHERE credential_hash = ? AND revoked_at IS NULL',
      )
        .bind(hash)
        .first()
    }
    const api = createApi({
      store: space ? profileStore(env.DB, env.BLOBS, space.id) : cloudflareStore(env.DB, env.BLOBS),
      token: space ? token : env.SYNC_TOKEN,
      limit,
    })
    return api(request)
  },
}
