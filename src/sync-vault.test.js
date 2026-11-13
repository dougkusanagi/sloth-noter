import { test } from 'node:test'
import assert from 'node:assert/strict'
import { platformVault, probeVault, readSyncSecrets, writeSyncSecrets } from './sync/vault.js'

function androidBridge({ fail = false } = {}) {
  const values = new Map()
  return {
    values,
    get: (name) => (fail ? 'error' : (values.get(name) ?? '')),
    set: (name, value) => (fail ? 'error' : (values.set(name, value), 'ok')),
    delete: (name) => (fail ? 'error' : (values.delete(name), 'ok')),
  }
}

test('the web has no vault, so sync stays off', async () => {
  assert.equal(platformVault({}), null)
  assert.deepEqual(await probeVault(null), { ok: false, reason: 'none' })
})

test('android keeps secrets through the Keystore bridge', async () => {
  const bridge = androidBridge()
  const vault = platformVault({ SlothSecrets: bridge })
  assert.equal(vault.kind, 'android')
  assert.deepEqual(await probeVault(vault), { ok: true })
  assert.equal(bridge.values.size, 0, 'the probe leaves nothing behind')
  await writeSyncSecrets(vault, { server: 'https://s', token: 't', key: 'K' })
  assert.deepEqual(await readSyncSecrets(vault), { server: 'https://s', token: 't', key: 'K' })
  // Existing secrets are not overwritten by a later probe.
  assert.deepEqual(await probeVault(vault), { ok: true })
  assert.deepEqual(await readSyncSecrets(vault), { server: 'https://s', token: 't', key: 'K' })
})

test('a failing Keystore turns sync off instead of throwing at the caller', async () => {
  const vault = platformVault({ SlothSecrets: androidBridge({ fail: true }) })
  assert.deepEqual(await probeVault(vault), { ok: false, reason: 'unavailable' })
  await assert.rejects(vault.get(), { name: 'VaultUnavailable' })
})

test('desktop calls the Tauri commands with only the sync entry', async () => {
  const calls = []
  let stored = null
  const vault = platformVault({
    __TAURI_INTERNALS__: {
      invoke: async (command, args) => {
        calls.push([command, args.name])
        if (command === 'secret_set') stored = args.value
        if (command === 'secret_delete') stored = null
        return command === 'secret_get' ? stored : undefined
      },
    },
  })
  assert.equal(vault.kind, 'desktop')
  assert.deepEqual(await probeVault(vault), { ok: true })
  assert.ok(calls.every(([, name]) => name === 'sync'))
  const broken = platformVault({
    __TAURI_INTERNALS__: {
      invoke: async () => {
        throw 'vault_unavailable'
      },
    },
  })
  assert.deepEqual(await probeVault(broken), { ok: false, reason: 'unavailable' })
})

test('an unreadable entry reads as not configured', async () => {
  const bridge = androidBridge()
  bridge.values.set('sync', '{oops')
  assert.equal(await readSyncSecrets(platformVault({ SlothSecrets: bridge })), null)
})
