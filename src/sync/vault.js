// Where the sync secrets live (ADR 0018): Android Keystore through the Kotlin bridge,
// the system vault through Tauri on desktop, nowhere on the web. Without a vault,
// sync stays off: secrets never go to localStorage, preferences, backups or logs.

const SECRET = 'sync'

export class VaultUnavailable extends Error {
  constructor() {
    super('vault_unavailable')
    this.name = 'VaultUnavailable'
  }
}

function androidVault(bridge, name) {
  const check = (result) => {
    if (result === 'error') throw new VaultUnavailable()
    return result
  }
  return {
    kind: 'android',
    async get() {
      return check(bridge.get(name)) || null
    },
    async set(value) {
      check(bridge.set(name, value))
    },
    async delete() {
      check(bridge.delete(name))
    },
  }
}

function desktopVault(invoke, name) {
  const call = async (command, args) => {
    try {
      return await invoke(command, { name, ...args })
    } catch {
      throw new VaultUnavailable()
    }
  }
  return {
    kind: 'desktop',
    get: async () => (await call('secret_get')) ?? null,
    set: (value) => call('secret_set', { value }),
    delete: () => call('secret_delete'),
  }
}

/** The platform vault, or null when there is none (web, or a desktop without one). */
export function platformVault(env = globalThis) {
  const name = SECRET
  if (env.SlothSecrets?.get) return androidVault(env.SlothSecrets, name)
  const invoke = env.__TAURI_INTERNALS__?.invoke
  if (typeof invoke === 'function') return desktopVault(invoke, name)
  return null
}

/**
 * Secrets for one server: session (or old access key), encryption key and, for an
 * account (ADR 0024), its e-mail and name. Kept as one entry.
 */
export async function readSyncSecrets(vault) {
  const text = await vault.get()
  if (!text) return null
  try {
    const value = JSON.parse(text)
    if (typeof value?.server === 'string' && typeof value?.token === 'string' && value?.key)
      return value
  } catch {
    // Unreadable entry: treat as not configured instead of guessing.
  }
  return null
}

export function writeSyncSecrets(
  vault,
  { server, token, key, email, name, publicKey, privateKey },
) {
  const payload = email ? { server, token, key, email, name } : { server, token, key }
  if (publicKey && privateKey) {
    payload.publicKey = publicKey
    payload.privateKey = privateKey
  }
  return vault.set(JSON.stringify(payload))
}

/**
 * Proves the vault works before sync is offered: write, read back and remove a probe.
 * Any failure means sync must stay off, with the reason shown to the person.
 */
export async function probeVault(vault) {
  if (!vault) return { ok: false, reason: 'none' }
  try {
    const previous = await vault.get()
    if (previous) return { ok: true }
    const probe = `probe-${Math.random().toString(36).slice(2)}`
    await vault.set(probe)
    const back = await vault.get()
    await vault.delete()
    return back === probe ? { ok: true } : { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}
