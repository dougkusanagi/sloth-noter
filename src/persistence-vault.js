import { newDocument, validateDocument } from './storage.js'

export const VAULT_STATUS = 'vault_status'
export const VAULT_CHOOSE = 'vault_choose'
export const VAULT_DISCONNECT = 'vault_disconnect'
const VAULT_LIST = 'vault_list'
const VAULT_APPLY = 'vault_apply'
const VAULT_READ_AUX = 'vault_read_aux'
const VAULT_WRITE_AUX = 'vault_write_aux'

const AUX_VERSION = 1

function newId() {
  return globalThis.crypto.randomUUID()
}

/**
 * The notes folder as a persistence adapter.
 *
 * The `.md` files are the notes; the tab list, preferences, trash and the
 * file-name to note-id mapping live in a small auxiliary state file kept in the
 * app data folder, never inside the notes folder. The adapter presents both as
 * the same versioned document the rest of the app already uses.
 *
 * `known` holds what the app last saw on disk, name -> { id, body }. Every write
 * to an existing file carries that text so the native side can refuse to
 * overwrite an edit made outside the app.
 */
export function createVaultAdapter(invoke, path) {
  let known = new Map()

  return {
    kind: 'vault',
    label: path,
    async readState() {
      const files = await invoke(VAULT_LIST)
      const rawAux = await invoke(VAULT_READ_AUX)
      known = new Map()
      if (files.length === 0 && rawAux === null) return null
      const aux = rawAux === null ? {} : JSON.parse(rawAux)
      const trash = Array.isArray(aux.trash) ? aux.trash : []
      const taken = new Set(trash.map((entry) => entry?.note?.id))
      const notes = files.map(({ name, contents }) => {
        let id = aux.ids?.[name]
        if (typeof id !== 'string' || taken.has(id)) id = newId()
        taken.add(id)
        known.set(name, { id, body: contents })
        return { id, name, body: contents, revision: 0 }
      })
      const present = new Set(notes.map((note) => note.id))
      let openIds = Array.isArray(aux.openIds) ? aux.openIds.filter((id) => present.has(id)) : []
      if (openIds.length === 0 && notes.length) openIds = [notes[0].id]
      const activeId = openIds.includes(aux.activeId) ? aux.activeId : (openIds.at(-1) ?? null)
      return JSON.stringify({
        version: 3,
        notes,
        trash,
        openIds,
        activeId,
        preferences: aux.preferences ?? newDocument().preferences,
      })
    },
    async readLegacy() {
      return null
    },
    async writeState(contents) {
      const document = JSON.parse(contents)
      const byId = new Map([...known].map(([name, entry]) => [entry.id, { name, ...entry }]))
      const removals = []
      const renames = []
      const writes = []
      for (const note of document.notes) {
        const previous = byId.get(note.id)
        if (!previous) {
          writes.push({ note, expected: null })
          continue
        }
        if (previous.name !== note.name) renames.push({ from: previous.name, note })
        if (previous.body !== note.body) writes.push({ note, expected: previous.body })
      }
      const kept = new Set(document.notes.map((note) => note.id))
      for (const [name, entry] of known)
        if (!kept.has(entry.id)) removals.push({ name, body: entry.body })

      // The auxiliary state goes first: a failure part-way leaves files intact and
      // the trash body saved, so at worst the newest keystrokes stay in memory.
      await invoke(VAULT_WRITE_AUX, {
        contents: JSON.stringify({
          version: AUX_VERSION,
          ids: Object.fromEntries(document.notes.map((note) => [note.name, note.id])),
          openIds: document.openIds,
          activeId: document.activeId,
          preferences: document.preferences,
          trash: document.trash,
        }),
      })

      for (const { name, body } of removals) {
        await invoke(VAULT_APPLY, { op: { kind: 'remove', name, expected: body } })
        known.delete(name)
      }
      // A rename may target a name freed by another rename in the same save.
      let pending = renames
      while (pending.length) {
        const blocked = []
        for (const item of pending) {
          if (known.has(item.note.name)) {
            blocked.push(item)
            continue
          }
          await invoke(VAULT_APPLY, { op: { kind: 'rename', from: item.from, to: item.note.name } })
          known.set(item.note.name, known.get(item.from))
          known.delete(item.from)
        }
        if (blocked.length === pending.length)
          throw new Error(`'${blocked[0].note.name}' already exists`)
        pending = blocked
      }
      for (const { note, expected } of writes) {
        await invoke(VAULT_APPLY, {
          op: { kind: 'write', name: note.name, contents: note.body, expected },
        })
        known.set(note.name, { id: note.id, body: note.body })
      }
    },
  }
}

/**
 * Lets the user pick a folder and, when it holds no notes yet, offers to copy the
 * notes from the application storage into it. Existing files are never touched.
 */
export async function connectVault(invoke, confirm = () => false) {
  const path = await invoke(VAULT_CHOOSE)
  if (!path) return false
  const files = await invoke(VAULT_LIST)
  if (files.length > 0 || (await invoke(VAULT_READ_AUX)) !== null) return true
  const previous = await invoke('read_state')
  let document = null
  try {
    document = previous === null ? null : validateDocument(JSON.parse(previous))
  } catch {
    document = null
  }
  const count = document?.notes.length ?? 0
  if (count > 0 && confirm(count)) {
    const error = await createVaultAdapter(invoke, path)
      .writeState(previous)
      .then(
        () => null,
        (cause) => cause,
      )
    if (error) throw error
  }
  return true
}
