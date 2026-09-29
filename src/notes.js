export function isDiscardableEmptyNote(note) {
  return note?.body === '' && note.revision === 0 && /^new note(?: \(\d+\))?\.md$/i.test(note.name)
}

export function uniqueName(notes, proposed) {
  const stem = proposed.toLocaleLowerCase().endsWith('.md') ? proposed.slice(0, -3) : proposed
  let name = `${stem}.md`,
    number = 2
  while (notes.some((note) => note.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
    name = `${stem} (${number++}).md`
  return name
}

export function headingFileName(body) {
  const heading = body.match(/^# [ \t]*(.+?)[ \t]*$/m)
  if (!heading) return null
  const title = heading[1]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .replace(/[. ]+$/, '')
    .trim()
  if (!title) return null
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(title)) return `_${title}.md`
  return title.toLocaleLowerCase().endsWith('.md') ? title : `${title}.md`
}

export function nameFromHeading(body, notes, currentId) {
  const name = headingFileName(body)
  return name
    ? uniqueName(
        notes.filter((note) => note.id !== currentId),
        name,
      )
    : null
}

export function reconcileHeadingNames(document) {
  const reserved = document.notes.filter((note) => !headingFileName(note.body))
  const assigned = []
  let changed = false
  const notes = document.notes.map((note) => {
    const proposed = headingFileName(note.body)
    if (!proposed) return note
    const name = uniqueName([...reserved, ...assigned], proposed)
    const next = name === note.name ? note : { ...note, name, revision: note.revision + 1 }
    if (next !== note) changed = true
    assigned.push(next)
    return next
  })
  return changed ? { ...document, notes } : document
}

export function moveToTrash(document, id, deletedAt) {
  const index = document.notes.findIndex((note) => note.id === id)
  if (index < 0) return document
  const note = document.notes[index]
  const openIds = document.openIds.filter((openId) => openId !== id)
  return {
    ...document,
    notes: document.notes.filter((item) => item.id !== id),
    trash: [...document.trash, { note, index, deletedAt }],
    openIds,
    activeId: document.activeId === id ? (openIds.at(-1) ?? null) : document.activeId,
  }
}

export function restoreFromTrash(document, id) {
  const entry = document.trash.find((item) => item.note.id === id)
  if (!entry) return document
  const notes = [...document.notes]
  const name = uniqueName(notes, entry.note.name)
  notes.splice(Math.min(entry.index, notes.length), 0, {
    ...entry.note,
    name,
    revision: entry.note.revision + (name === entry.note.name ? 0 : 1),
  })
  return {
    ...document,
    notes,
    trash: document.trash.filter((item) => item.note.id !== id),
    openIds: [...document.openIds, id],
    activeId: id,
  }
}

export function purgeFromTrash(document, id) {
  return { ...document, trash: document.trash.filter((item) => item.note.id !== id) }
}
