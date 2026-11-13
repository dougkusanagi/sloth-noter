// Where the sync secrets live (ADR 0018): Android Keystore through the Kotlin bridge,
// the system vault through Tauri on desktop, nowhere on the web. Without a vault,
// sync stays off: secrets never go to localStorage, preferences, backups or logs.

const NAME = 'sync'

export class VaultUnavailable extends Error {
  constructor() {
    super('vault_unavailable')
    this.name = 'VaultUnavailable'
  }
}

function androidVault(bridge) {
  const check = (result) => {
    if (result === 'error') throw new VaultUnavailable()
    return result
  }
  return {
    kind: 'android',
    async get() {
      return check(bridge.get(NAME)) || null
    },
    async set(value) {
      check(bridge.set(NAME, value))
    },
    async delete() {
      check(bridge.delete(NAME))
    },
  }
}

function desktopVault(invoke) {
  const call = async (command, args) => {
    try {
      return await invoke(command, { name: NAME, ...args })
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
  if (env.SlothSecrets?.get) return androidVault(env.SlothSecrets)
  const invoke = env.__TAURI_INTERNALS__?.invoke
  if (typeof invoke === 'function') return desktopVault(invoke)
  return null
}

/** Secrets for one server: auth token and encryption key, kept as one entry. */
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

export function writeSyncSecrets(vault, { server, token, key }) {
  return vault.set(JSON.stringify({ server, token, key }))
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
