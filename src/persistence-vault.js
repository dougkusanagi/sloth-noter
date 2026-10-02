import { newDocument, validateDocument } from './storage.js'
import { mergeExternal, resolveConflict } from './vault-sync.js'

export const VAULT_STATUS = 'vault_status'
export const VAULT_CHOOSE = 'vault_choose'
export const VAULT_DISCONNECT = 'vault_disconnect'
const VAULT_LIST = 'vault_list'
const VAULT_STAMPS = 'vault_stamps'
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
  let lastStamps = null

  return {
    kind: 'vault',
    label: path,
    // Bringing outside changes in: cheap stamp check first, full read only on change.
    sync: {
      async scan() {
        const stamps = JSON.stringify(await invoke(VAULT_STAMPS))
        if (stamps === lastStamps) return null
        const files = await invoke(VAULT_LIST)
        lastStamps = stamps
        return files
      },
      merge: (document, files) => mergeExternal(document, files, known),
      resolve: (document, conflict, choice) => resolveConflict(document, conflict, choice, known),
    },
    async readState() {
      const files = await invoke(VAULT_LIST)
      const rawAux = await invoke(VAULT_READ_AUX)
      known = new Map()
      lastStamps = null
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
        ...(aux.assets ? { assets: aux.assets } : {}),
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
      const kept = new Set(document.notes.map((note) => note.id))
      const trashed = new Set(document.trash.map((entry) => entry.note.id))
      const byId = new Map([...known].map(([name, entry]) => [entry.id, { name, ...entry }]))
      const renames = []
      const writes = []
      for (const note of document.notes) {
        const previous = byId.get(note.id)
        if (previous) {
          if (previous.name !== note.name) renames.push({ from: previous.name, note })
          if (previous.body !== note.body) writes.push({ note, expected: previous.body })
          continue
        }
        // A note without a file yet. If an orphaned file already has its name (a
        // restored backup), the note takes it over, still guarded by the seen text.
        const orphan = known.get(note.name)
        if (orphan && !kept.has(orphan.id)) {
          known.set(note.name, { id: note.id, body: orphan.body })
          if (orphan.body !== note.body) writes.push({ note, expected: orphan.body })
        } else writes.push({ note, expected: null })
      }

      // The auxiliary state goes first: a failure part-way leaves files intact and
      // the trash body saved, so at worst the newest keystrokes stay in memory.
      await invoke(VAULT_WRITE_AUX, {
        contents: JSON.stringify({
          version: AUX_VERSION,
          assets: document.assets ?? [],
          ids: Object.fromEntries(document.notes.map((note) => [note.name, note.id])),
          openIds: document.openIds,
          activeId: document.activeId,
          preferences: document.preferences,
          trash: document.trash,
        }),
      })

      // Only a note moved to the trash deletes its file. A note that merely left the
      // document (a restored backup) keeps its file, which is picked up again later.
      for (const [name, entry] of [...known]) {
        if (kept.has(entry.id)) continue
        if (trashed.has(entry.id))
          await invoke(VAULT_APPLY, { op: { kind: 'remove', name, expected: entry.body } })
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
 * Pick a destination without activating it, then choose to open it or copy the
 * current workspace. Native activation preflights conflicts and copies images
 * before switching the saved path. Confirmation can be asynchronous.
 */
export async function connectVault(invoke, confirm = () => false, currentDocument = null) {
  const path = await invoke(VAULT_CHOOSE)
  if (!path) return false
  let document = currentDocument
  if (!document) {
    try {
      const previous = await invoke('read_state')
      document = previous === null ? null : validateDocument(JSON.parse(previous))
    } catch {
      document = null
    }
  }
  const count = document?.notes.length ?? 0
  const copy = count > 0 && (await confirm(count))
  if (copy === null) return false
  await invoke('vault_activate', { document: copy ? JSON.stringify(document) : null })
  return true
}
