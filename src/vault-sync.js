import { uniqueName } from './notes.js'

function newId() {
  return globalThis.crypto.randomUUID()
}

function withoutNote(document, id) {
  const openIds = document.openIds.filter((openId) => openId !== id)
  return {
    ...document,
    notes: document.notes.filter((note) => note.id !== id),
    openIds,
    ...(document.pinnedIds
      ? { pinnedIds: document.pinnedIds.filter((pinnedId) => pinnedId !== id) }
      : {}),
    activeId: document.activeId === id ? (openIds.at(-1) ?? null) : document.activeId,
  }
}

/**
 * Brings changes made to the folder outside the app into the document.
 *
 * `known` maps file name -> { id, body }: what the app last saw on disk. A note
 * whose text still equals that is untouched locally, so the disk version simply
 * replaces it. When both sides changed, nothing is overwritten: the note is
 * reported as a conflict for the user to resolve. Runs synchronously against the
 * latest document, so no edit can slip in between reading it and applying this.
 */
export function mergeExternal(document, files, known) {
  const disk = new Map(files.map((file) => [file.name, file.contents]))
  let next = document
  let changed = false
  const conflicts = []

  for (const [name, entry] of [...known]) {
    const note = next.notes.find((item) => item.id === entry.id)
    // A trashed note or one with a pending local rename is the writer's business.
    if (!note || note.name !== name) continue
    const external = disk.get(name)
    if (external === undefined) {
      if (note.body === entry.body) {
        next = withoutNote(next, note.id)
        known.delete(name)
        changed = true
      } else conflicts.push({ id: note.id, name, kind: 'deleted' })
    } else if (external !== entry.body) {
      if (external === note.body) entry.body = external
      else if (note.body === entry.body) {
        next = {
          ...next,
          notes: next.notes.map((item) =>
            item.id === note.id ? { ...item, body: external, revision: item.revision + 1 } : item,
          ),
        }
        entry.body = external
        changed = true
      } else conflicts.push({ id: note.id, name, kind: 'changed', external })
    }
  }

  for (const [name, body] of disk) {
    if (known.has(name) || next.notes.some((note) => note.name === name)) continue
    const id = newId()
    known.set(name, { id, body })
    next = { ...next, notes: [...next.notes, { id, name, body, revision: 0 }] }
    changed = true
  }
  return { document: next, conflicts, changed }
}

/**
 * Applies the user's decision for one conflict. `mine` keeps the local text and
 * lets the next save overwrite the file; `external` takes the disk version;
 * `both` keeps the local text under the original name and the disk text as a copy.
 */
export function resolveConflict(document, conflict, choice, known) {
  const entry = known.get(conflict.name)
  const note = document.notes.find((item) => item.id === conflict.id)
  if (!entry || !note) return document

  if (conflict.kind === 'deleted') {
    if (choice === 'external') {
      known.delete(conflict.name)
      return withoutNote(document, note.id)
    }
    known.delete(conflict.name) // the save recreates the file from the local text
    return document
  }

  if (choice === 'external') {
    entry.body = conflict.external
    return {
      ...document,
      notes: document.notes.map((item) =>
        item.id === note.id
          ? { ...item, body: conflict.external, revision: item.revision + 1 }
          : item,
      ),
    }
  }
  entry.body = conflict.external // the local text becomes the expected replacement
  if (choice === 'mine') return document
  const stem = conflict.name.replace(/\.md$/i, '')
  const copy = {
    id: newId(),
    name: uniqueName(document.notes, `${stem} (disk)`),
    body: conflict.external,
    revision: 0,
  }
  return { ...document, notes: [...document.notes, copy] }
}
