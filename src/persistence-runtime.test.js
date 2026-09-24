import test from 'node:test'
import assert from 'node:assert/strict'
import { createPersistence } from './persistence.js'
import { createWebAdapter } from './persistence-web.js'
import { createDesktopAdapter } from './persistence-desktop.js'
import { createAppPersistence } from './persistence-runtime.js'
import { STORAGE_KEY, V2_KEY } from './storage.js'

function memoryStorage() {
  const values = new Map()
  return { getItem: key => (values.has(key) ? values.get(key) : null), setItem: (key, value) => values.set(key, value) }
}

function memoryHost(overrides = {}) {
  const files = new Map()
  const invoke = async (command, args) => {
    if (command === 'read_state') return files.has('state') ? files.get('state') : null
    if (command === 'write_state') { files.set('state', args.contents); return null }
    if (command === 'persistence_info') return overrides.info ?? { kind: 'desktop', statePath: 'C:\\vault-data\\state.v3.json', appVersion: '0.1.0' }
    throw new Error(`unexpected command ${command}`)
  }
  return { invoke, files }
}

test('an older record is migrated through the contract and kept', async () => {
  const storage = memoryStorage()
  const persistence = createPersistence(createWebAdapter(storage))
  const legacy = { version: 2, notes: [{ id: 'a', name: 'a.md', body: 'olá\n', revision: 2 }], openIds: ['a'], activeId: 'a', preferences: { tabsVisible: true, theme: 'light', fontSize: 18 } }
  storage.setItem(V2_KEY, JSON.stringify(legacy))
  const loaded = await persistence.load()
  assert.equal(loaded.error, null)
  assert.equal(loaded.document.notes[0].body, 'olá\n')
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 3)
  assert.ok(storage.getItem(V2_KEY))
})

test('the desktop adapter only uses the native state commands', async () => {
  const host = memoryHost()
  const persistence = createPersistence(createDesktopAdapter(host.invoke))
  const loaded = await persistence.load()
  assert.equal(await persistence.save(loaded.document), null)
  assert.equal(loaded.document.notes.length, 1)
})

test('a plain browser keeps the web storage', async () => {
  const storage = memoryStorage()
  const persistence = await createAppPersistence({ localStorage: storage }, async () => ({ invoke: async () => null }))
  assert.equal(persistence.kind, 'web')
  assert.equal(persistence.label, 'this browser')
  const loaded = await persistence.load()
  assert.equal(await persistence.save(loaded.document), null)
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).version, 3)
})

test('the native window never falls back to the browser storage', async () => {
  const host = memoryHost()
  const target = {
    __TAURI_INTERNALS__: { invoke: async () => null },
    get localStorage() { throw new Error('localStorage must not be touched in the desktop app') },
  }
  const persistence = await createAppPersistence(target, async () => ({ invoke: host.invoke }))
  assert.equal(persistence.kind, 'desktop')
  assert.equal(persistence.label, 'C:\\vault-data\\state.v3.json')
  const loaded = await persistence.load()
  assert.equal(loaded.error, null)
  const document = { ...loaded.document, preferences: { ...loaded.document.preferences, theme: 'dark' } }
  assert.equal(await persistence.save(document), null)
  assert.equal(JSON.parse(host.files.get('state')).preferences.theme, 'dark')
})

test('the desktop label falls back when the native side cannot answer', async () => {
  const target = { __TAURI_INTERNALS__: { invoke: async () => null } }
  const invoke = async command => {
    if (command === 'persistence_info') throw new Error('unavailable')
    return null
  }
  const persistence = await createAppPersistence(target, async () => ({ invoke }))
  assert.equal(persistence.label, 'the application data folder')
})
