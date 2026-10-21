export const EXTERNAL_READ = 'external_read'
export const EXTERNAL_WRITE = 'external_write'
export const EXTERNAL_RELEASE = 'external_release'

/** A note whose text lives in a file the user opened from outside the notes folder. */
export const isExternalNote = (note) => Boolean(note.external)

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
export async function writeExternalNotes(invoke, document, seen, paths = new Map()) {
  const live = new Set()
  const notes = [...document.notes, ...document.trash.map((entry) => entry.note)]
  for (const note of notes) {
    if (!isExternalNote(note)) continue
    live.add(note.id)
    paths.set(note.id, note.external.path)
    const expected = seen.get(note.id) ?? note.external.seen
    if (note.body !== expected) {
      await invoke(EXTERNAL_WRITE, {
        path: note.external.path,
        contents: note.body,
        expected,
      })
      seen.set(note.id, note.body)
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
}

/**
 * Brings external notes up to the file on disk when the document is loaded. The file
 * wins: the app only saves text it has written, so a difference means an outside edit.
 * A file that cannot be read keeps its stored text; the next save reports the problem.
 */
export async function readExternalNotes(invoke, notes, seen, paths = new Map()) {
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
