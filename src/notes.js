export function isDiscardableEmptyNote(note) {
  return (
    (note?.body === '' ||
      note?.body === '# ' ||
      note?.body === `# ${note?.name.replace(/\.md$/i, '')}`) &&
    note.revision === 0 &&
    /^new note(?: \(\d+\))?\.md$/i.test(note.name)
  )
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
    // eslint-disable-next-line no-control-regex -- control characters are invalid in file names
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
  // Numbered names already resolve duplicate headings. Keep them stable even
  // when the folder lists "Title (2).md" before "Title.md" on the next launch.
  const proposed = new Map(
    document.notes.map((note) => {
      const heading = headingFileName(note.body)
      return [note, heading ? uniqueName([], heading) : null]
    }),
  )
  const reserved = document.notes.filter((note) => {
    const name = proposed.get(note)
    if (!name || name === note.name) return true
    const stem = name.slice(0, -3)
    return (
      note.name.startsWith(stem) &&
      /^ \((?:[2-9]|[1-9]\d+)\)\.md$/.test(note.name.slice(stem.length))
    )
  })
  const preserved = new Set(reserved)
  const assigned = []
  let changed = false
  const notes = document.notes.map((note) => {
    if (preserved.has(note)) return note
    const name = uniqueName([...reserved, ...assigned], proposed.get(note))
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
    ...(document.pinnedIds
      ? { pinnedIds: document.pinnedIds.filter((pinnedId) => pinnedId !== id) }
      : {}),
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
