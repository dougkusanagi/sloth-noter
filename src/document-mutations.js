import { ensureTitle } from './title.js'
import { headingFileName, nameFromHeading, uniqueName } from './notes.js'
import { frontmatterEnd } from './frontmatter.js'
import { noteReferences, renameWikiReferences } from './markdown-model.js'
import { isExternalNote } from './external-notes.js'
import { setNoteCover } from './note-cover.js'
import { setNoteIcon } from './note-icon.js'

/**
 * Creates a note and returns the updated document together with the created note.
 * Shared by desktop and mobile shells so naming, title normalization and timestamps stay aligned.
 */
export function createNoteDocument(
  document,
  {
    id = crypto.randomUUID(),
    name = 'new note.md',
    title = '',
    body = null,
    group = undefined,
    prepend = false,
    modifiedAt = Date.now(),
    createdAt = modifiedAt,
  } = {},
) {
  let content = body
  if (content === null || content === undefined) {
    content = title.trim() ? ensureTitle('', title) : '# \n'
  } else if (content === '') {
    content = name === 'new note.md' ? '# \n' : ensureTitle('', name.replace(/\.md$/i, ''))
  } else {
    content = ensureTitle(content, name.replace(/\.md$/i, ''))
  }
  const headingName = headingFileName(content)
  const note = {
    id,
    name: uniqueName(document.notes, headingName ?? name),
    body: content,
    revision: 0,
    createdAt,
    modifiedAt,
    ...(group && document.groups?.includes(group) ? { group } : {}),
  }
  return {
    note,
    document: {
      ...document,
      notes: prepend ? [note, ...document.notes] : [...document.notes, note],
      openIds: [...document.openIds, id],
      activeId: id,
    },
  }
}

/**
 * Updates a note's body, recalculates its heading-derived filename (unless external),
 * rewrites wiki references in active and trashed notes, and optionally registers a new asset.
 */
export function updateNoteBody(
  document,
  id,
  body,
  { newAsset = undefined, modifiedAt = Date.now() } = {},
) {
  const previous = document.notes.find((note) => note.id === id)
  if (!previous) return document
  const external = isExternalNote(previous)
  const normalized = external ? body : ensureTitle(body)
  if (previous.body === normalized && !newAsset) return document
  const name = external
    ? previous.name
    : (nameFromHeading(normalized, document.notes, id) ?? previous.name)
  const previousName = previous.name
  const rewrite = (note) => {
    const isTarget = note.id === id
    const content = isTarget ? normalized : note.body
    const nextBody =
      name && previousName && name !== previousName
        ? renameWikiReferences(
            content,
            previousName,
            name,
            isTarget ? undefined : noteReferences(note).wiki,
          )
        : content
    return isTarget || nextBody !== note.body
      ? {
          ...note,
          name: isTarget ? name : note.name,
          body: nextBody,
          revision: note.revision + 1,
          modifiedAt: isTarget ? modifiedAt : note.modifiedAt,
        }
      : note
  }
  return {
    ...document,
    ...(newAsset ? { assets: [...(document.assets ?? []), newAsset] } : {}),
    notes: document.notes.map(rewrite),
    trash: document.trash.map((entry) => ({ ...entry, note: rewrite(entry.note) })),
  }
}

/**
 * Validates an explicit note rename and rewrites its H1 heading plus all wiki references.
 */
export function renameNoteDocument(
  document,
  id,
  proposed,
  { strict = true, modifiedAt = Date.now() } = {},
) {
  const note = document.notes.find((item) => item.id === id)
  if (!note) return { error: 'mobile.noteGone' }
  if (isExternalNote(note)) return { error: 'external.noRename' }
  const title = proposed.trim().replace(/\.md$/i, '')
  const name = `${title}.md`
  if (
    !title ||
    /[\r\n]/.test(title) ||
    (strict &&
      (ensureTitle(`# ${title}`) !== `# ${title}` || headingFileName(`# ${title}`) !== name))
  )
    return { error: 'mobile.invalidName' }
  if (
    document.notes.some(
      (item) => item.id !== id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    )
  )
    return { error: 'error.nameExists' }
  const start = frontmatterEnd(note.body)
  const end = note.body.indexOf('\n', start)
  const nextBody = `${note.body.slice(0, start)}# ${title}${end < 0 ? '' : note.body.slice(end)}`
  return {
    document: updateNoteBody(document, id, nextBody, { modifiedAt }),
  }
}

export function togglePinnedNote(document, id) {
  const pinned = document.pinnedIds ?? []
  return {
    ...document,
    openIds: document.openIds.includes(id) ? document.openIds : [...document.openIds, id],
    pinnedIds: pinned.includes(id) ? pinned.filter((item) => item !== id) : [...pinned, id],
  }
}

export function setNoteBoardView(preferences, id, board) {
  const boardNotes = { ...preferences?.boardNotes }
  if (board) boardNotes[id] = true
  else delete boardNotes[id]
  return { boardNotes }
}

export function toggleNoteWrap(preferences, id) {
  const currentValue = Object.hasOwn(preferences?.wrapLinesByNote ?? {}, id)
    ? preferences.wrapLinesByNote[id]
    : preferences?.wrapLines !== false
  return {
    wrapLinesByNote: {
      ...preferences?.wrapLinesByNote,
      [id]: !currentValue,
    },
  }
}

export function applyNoteCover(document, id, image, imported = false) {
  const note = document.notes.find((item) => item.id === id)
  if (!note || isExternalNote(note)) return null
  const body = setNoteCover(note.body, image)
  if (body === note.body) return document
  return updateNoteBody(document, id, body, { newAsset: imported ? image : undefined })
}

export function applyNoteIcon(document, id, emoji) {
  const note = document.notes.find((item) => item.id === id)
  if (!note || isExternalNote(note)) return null
  const body = setNoteIcon(note.body, emoji)
  if (body === note.body) return document
  return updateNoteBody(document, id, body)
}

export function setNoteGroupDocument(document, id, group) {
  const valid = group && (document.groups ?? []).includes(group) ? group : undefined
  let changed = false
  const notes = document.notes.map((note) => {
    if (note.id !== id || note.group === valid) return note
    changed = true
    return { ...note, group: valid }
  })
  return changed ? { ...document, notes } : document
}

export function closeOpenNoteDocument(document, id) {
  if (!document.openIds.includes(id)) return document
  const openIds = document.openIds.filter((item) => item !== id)
  return {
    ...document,
    openIds,
    activeId: document.activeId === id ? (openIds.at(-1) ?? null) : document.activeId,
  }
}

export function closeOtherOpenNotesDocument(document, keepId) {
  const nextOpenIds = document.openIds.includes(keepId) ? [keepId] : []
  if (
    nextOpenIds.length === document.openIds.length &&
    nextOpenIds.every((id, index) => id === document.openIds[index])
  )
    return document
  return {
    ...document,
    openIds: nextOpenIds,
    activeId: nextOpenIds[0] ?? null,
  }
}
