import { createApi, rateLimiter } from './api.js'
import { cloudflareStore } from './cloudflare-store.js'

// The limiter lives per isolate: it slows a runaway client, it is not a hard quota.
let limit

export default {
  async fetch(request, env) {
    limit ??= rateLimiter({ limit: Number(env.RATE_LIMIT ?? 600), windowMs: 60_000 })
    const api = createApi({
      store: cloudflareStore(env.DB, env.BLOBS),
      token: env.SYNC_TOKEN,
      limit,
    })
    return api(request)
  },
}
