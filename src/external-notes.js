import { friendlyError } from './errors.js'
import { t } from './i18n.js'

export const EXTERNAL_READ = 'external_read'
export const EXTERNAL_WRITE = 'external_write'
export const EXTERNAL_RELEASE = 'external_release'

/** A note whose text lives in a file the user opened from outside the notes folder. */
export const isExternalNote = (note) => Boolean(note?.external)

/** Creates the note for a file opened in place. `contents` is the text just read from it. */
export function externalNote({ id, name, path, contents, revision = 0 }) {
  return { id, name, body: contents, revision, external: { path, seen: contents } }
}

/**
 * Writes each external note whose text changed since the last text seen on disk.
 * `seen` maps note id -> text last read or written. The native side refuses the
 * write when the file changed outside the app, so the edit is not lost silently.
 * Removing a note never deletes its file.
 */
export async function writeExternalNotes(
  invoke,
  document,
  seen,
  paths = new Map(),
  { continueOnError = false } = {},
) {
  const failures = []
  const live = new Set()
  const notes = [...document.notes, ...document.trash.map((entry) => entry.note)]
  for (const note of notes) {
    if (!isExternalNote(note)) continue
    live.add(note.id)
    paths.set(note.id, note.external.path)
    const expected = seen.get(note.id) ?? note.external.seen
    if (!seen.has(note.id)) seen.set(note.id, expected)
    if (note.body !== expected) {
      try {
        await invoke(EXTERNAL_WRITE, {
          path: note.external.path,
          contents: note.body,
          expected,
        })
        seen.set(note.id, note.body)
      } catch (cause) {
        const error = new Error(
          t('external.writeFailed', {
            name: note.name,
            path: note.external.path,
            error: friendlyError(cause),
          }),
        )
        if (!continueOnError) throw error
        failures.push(error.message)
      }
    } else seen.set(note.id, expected)
  }
  // A note that left the document for good no longer needs permission to write its file.
  const stillUsed = new Set(notes.filter(isExternalNote).map((note) => note.external.path))
  for (const id of [...seen.keys()]) {
    if (live.has(id)) continue
    seen.delete(id)
    const path = paths.get(id)
    paths.delete(id)
    if (path && !stillUsed.has(path)) await invoke(EXTERNAL_RELEASE, { path }).catch(() => {})
  }
  return failures
}

/** Keep unsent text together with the last confirmed disk text for safe recovery. */
export function externalSnapshot(document, seen) {
  const snapshot = (note) =>
    isExternalNote(note)
      ? { ...note, external: { ...note.external, seen: seen.get(note.id) ?? note.external.seen } }
      : note
  return {
    ...document,
    notes: document.notes.map(snapshot),
    trash: document.trash.map((entry) => ({ ...entry, note: snapshot(entry.note) })),
  }
}

export function pendingExternalWarning(document) {
  const trash = Array.isArray(document.trash) ? document.trash.map((entry) => entry?.note) : []
  return (
    [...document.notes, ...trash]
      .filter((note) => isExternalNote(note) && note.body !== note.external.seen)
      .map((note) => t('external.pending', { name: note.name, path: note.external.path }))
      .join('\n') || null
  )
}

/**
 * Brings clean external notes up to date on load. Pending local text is retained
 * with its original disk baseline so it can be retried or resolved as a conflict.
 */
export async function readExternalNotes(invoke, notes, seen, paths = new Map(), history = null) {
  const result = []
  for (const note of notes) {
    if (!isExternalNote(note)) {
      result.push(note)
      continue
    }
    paths.set(note.id, note.external.path)
    let disk
    try {
      disk = await invoke(EXTERNAL_READ, { path: note.external.path })
    } catch {
      seen.set(note.id, note.external.seen)
      result.push(note)
      continue
    }
    history?.record(note, disk, disk, 'abertura')
    // A local snapshot may contain text that never reached its external file.
    // Keep it until explicitly resolved; do not replace it with disk on restart.
    if (note.body !== note.external.seen && disk !== note.body) {
      seen.set(note.id, note.external.seen)
      result.push(note)
      continue
    }
    if (note.body !== disk) history?.record(note, note.body, disk, 'disco-externo')
    seen.set(note.id, disk)
    result.push(
      note.body === disk && note.external.seen === disk
        ? note
        : {
            ...note,
            body: disk,
            revision: note.body === disk ? note.revision : note.revision + 1,
            external: { ...note.external, seen: disk },
          },
    )
  }
  return result
}

/**
 * Compares each open external note with its file. A note left untouched follows the
 * file; a note edited here while the file also changed is returned as a conflict for
 * the user to settle, since either side would lose text.
 */
export async function checkExternalNotes(invoke, document, seen) {
  let notes = document.notes
  const conflicts = []
  for (const note of document.notes) {
    if (!isExternalNote(note)) continue
    let disk
    try {
      disk = await invoke(EXTERNAL_READ, { path: note.external.path })
    } catch {
      continue // missing or unreadable: the next save reports it
    }
    const known = seen.get(note.id) ?? note.external.seen
    if (disk === known) continue
    if (note.body === known) {
      seen.set(note.id, disk)
      notes = notes.map((item) =>
        item.id === note.id
          ? {
              ...item,
              body: disk,
              revision: item.revision + 1,
              external: { ...item.external, seen: disk },
            }
          : item,
      )
    } else conflicts.push({ id: note.id, name: note.name, disk })
  }
  return { document: notes === document.notes ? document : { ...document, notes }, conflicts }
}

/** What the interface needs from an adapter to settle outside edits of opened files. */
export function externalsApi(invoke, seen) {
  return {
    check: (document) => checkExternalNotes(invoke, document, seen),
    accept: (id, disk) => seen.set(id, disk),
  }
}
