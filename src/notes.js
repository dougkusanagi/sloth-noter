export function uniqueName(notes, proposed) {
  const stem = proposed.toLocaleLowerCase().endsWith('.md') ? proposed.slice(0, -3) : proposed
  let name = `${stem}.md`, number = 2
  while (notes.some(note => note.name.toLocaleLowerCase() === name.toLocaleLowerCase())) name = `${stem} (${number++}).md`
  return name
}

export function moveToTrash(document, id, deletedAt) {
  const index = document.notes.findIndex(note => note.id === id)
  if (index < 0) return document
  const note = document.notes[index]
  const openIds = document.openIds.filter(openId => openId !== id)
  return {
    ...document,
    notes: document.notes.filter(item => item.id !== id),
    trash: [...document.trash, { note, index, deletedAt }],
    openIds,
    activeId: document.activeId === id ? (openIds.at(-1) ?? null) : document.activeId,
  }
}

export function restoreFromTrash(document, id) {
  const entry = document.trash.find(item => item.note.id === id)
  if (!entry) return document
  const notes = [...document.notes]
  const name = uniqueName(notes, entry.note.name)
  notes.splice(Math.min(entry.index, notes.length), 0, { ...entry.note, name, revision: entry.note.revision + (name === entry.note.name ? 0 : 1) })
  return {
    ...document,
    notes,
    trash: document.trash.filter(item => item.note.id !== id),
    openIds: [...document.openIds, id],
    activeId: id,
  }
}

export function purgeFromTrash(document, id) {
  return { ...document, trash: document.trash.filter(item => item.note.id !== id) }
}
