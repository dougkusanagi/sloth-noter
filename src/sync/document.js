// Bridges the sync engine and the notes document. The engine works on payloads;
// this module reads them from the document and writes the result back, together
// with the sync state, so both land in the same save.

import { isExternalNote } from '../external-notes.js'
import { emptyState } from './engine.js'

const payloadOf = (note, trashed) => ({
  name: note.name,
  body: note.body,
  ...(note.group ? { group: note.group } : {}),
  trashed,
})

const samePayload = (a, b) =>
  a.name === b.name &&
  a.body === b.body &&
  (a.group ?? null) === (b.group ?? null) &&
  a.trashed === b.trashed

/** Notes that sync: active and trashed ones. Files opened in place stay out (ADR 0001). */
export function localNotes(document) {
  return [
    ...document.notes
      .filter((note) => !isExternalNote(note))
      .map((note) => ({
        id: note.id,
        payload: payloadOf(note, false),
      })),
    ...document.trash
      .filter((entry) => !isExternalNote(entry.note))
      .map((entry) => ({ id: entry.note.id, payload: payloadOf(entry.note, true) })),
  ]
}

/** The saved state for this server; another server starts over (ADR 0018). */
export function syncState(document, server) {
  const saved = document.sync
  return saved?.server === server
    ? { cursor: saved.cursor, bases: saved.bases, blobs: saved.blobs ?? {} }
    : emptyState()
}

/**
 * Applies a sync result to the latest document. `snapshot` is what `localNotes` gave the
 * engine. A note the person changed while sync ran is left alone and its base goes back
 * to `before`, so the next run merges instead of overwriting either side.
 */
export function applySync(document, { server, snapshot, before, result, now = Date.now() }) {
  const sent = new Map(snapshot.map((note) => [note.id, note.payload]))
  const current = new Map(localNotes(document).map((note) => [note.id, note.payload]))
  const bases = { ...result.state.bases }
  const untouched = (id) => {
    const then = sent.get(id)
    const nowPayload = current.get(id)
    if (!then && !nowPayload) return true
    return Boolean(then && nowPayload && samePayload(then, nowPayload))
  }
  const keepBase = (id) => {
    if (before.bases[id]) bases[id] = before.bases[id]
    else delete bases[id]
  }

  let notes = [...document.notes]
  let trash = [...document.trash]
  const groups = new Set(document.groups ?? [])
  const removeEverywhere = (id) => {
    notes = notes.filter((note) => note.id !== id)
    trash = trash.filter((entry) => entry.note.id !== id)
  }
  const existing = (id) =>
    document.notes.find((note) => note.id === id) ??
    document.trash.find((entry) => entry.note.id === id)?.note

  for (const id of result.apply.remove) {
    if (!untouched(id)) keepBase(id)
    else removeEverywhere(id)
  }
  for (const { id, payload } of result.apply.upsert) {
    if (!untouched(id)) {
      keepBase(id)
      continue
    }
    const old = existing(id)
    const note = {
      ...(old ?? {}),
      id,
      name: payload.name,
      body: payload.body,
      revision: old ? old.revision + 1 : 0,
      modifiedAt: now,
    }
    if (payload.group) {
      note.group = payload.group
      groups.add(payload.group)
    } else delete note.group
    const index = notes.findIndex((item) => item.id === id)
    const trashIndex = trash.findIndex((entry) => entry.note.id === id)
    if (payload.trashed) {
      if (index >= 0) notes.splice(index, 1)
      const entry = { note, index: Math.max(0, index), deletedAt: now }
      if (trashIndex >= 0) trash[trashIndex] = { ...trash[trashIndex], note }
      else trash.push(entry)
    } else {
      if (trashIndex >= 0) trash.splice(trashIndex, 1)
      if (index >= 0) notes[index] = note
      else notes.push(note)
    }
  }

  const live = new Set(notes.map((note) => note.id))
  let openIds = document.openIds.filter((id) => live.has(id))
  if (!openIds.length && notes.length) openIds = [notes[0].id]
  const activeId = openIds.includes(document.activeId)
    ? document.activeId
    : (openIds.at(-1) ?? null)
  const next = {
    ...document,
    notes,
    trash,
    openIds,
    activeId,
    sync: { server, cursor: result.state.cursor, bases, blobs: result.state.blobs },
  }
  if (document.pinnedIds) next.pinnedIds = document.pinnedIds.filter((id) => openIds.includes(id))
  if (groups.size) next.groups = [...groups]
  return next
}
