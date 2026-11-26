import { createNoteDocument } from '../document-mutations.js'

export const PENDING_NOTE_LIMIT = 1_000_000

/**
 * Parses pending quick-note entries returned by `SlothSystem.takePendingNotes()`.
 * Accepts a JSON string or an array and ignores malformed entries without throwing.
 */
export function parsePendingNotes(raw) {
  let items = raw
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      items = JSON.parse(trimmed)
    } catch {
      return []
    }
  }
  if (!Array.isArray(items)) return []
  const result = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    if (typeof item.id !== 'string' || !item.id.trim()) continue
    const title = typeof item.title === 'string' ? item.title : ''
    const body = typeof item.body === 'string' ? item.body : ''
    const createdAt =
      Number.isSafeInteger(item.createdAt) && item.createdAt >= 0 ? item.createdAt : null
    result.push({ id: item.id.trim(), title, body, createdAt })
  }
  return result
}

/**
 * Formats a lock-screen note entry into Markdown with an H1 heading.
 * Returns `null` when blank, `{ tooLarge: true }` above `PENDING_NOTE_LIMIT`, or `{ body }`.
 */
export function formatPendingNoteBody({
  title = '',
  body = '',
  fallbackTitle = 'Quick note',
} = {}) {
  const cleanTitle = String(title)
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replace(/[\r\n]+/g, ' ')
    .replace(/^#+\s*/, '')
    .trim()
  const cleanBody = String(body).replaceAll('\r\n', '\n').replaceAll('\r', '\n').trim()
  if (!cleanTitle && !cleanBody) return null
  if (cleanTitle.length + cleanBody.length > PENDING_NOTE_LIMIT) return { tooLarge: true }
  if (cleanTitle) {
    return {
      body: cleanBody ? `# ${cleanTitle}\n\n${cleanBody}` : `# ${cleanTitle}\n`,
    }
  }
  if (/^#\s+\S/.test(cleanBody)) return { body: cleanBody }
  return { body: `# ${fallbackTitle}\n\n${cleanBody}` }
}

/**
 * Idempotently ingests pending quick notes into the document without duplicating notes already
 * present in `notes` or `trash`. Returns the next document and the IDs safe to acknowledge.
 */
export function ingestPendingNotes(
  document,
  rawEntries,
  { fallbackTitle = 'Quick note', now = Date.now() } = {},
) {
  const entries = parsePendingNotes(rawEntries)
  const existingIds = new Set([
    ...(document.notes ?? []).map((note) => note.id),
    ...(document.trash ?? []).map((entry) => entry.note?.id).filter(Boolean),
  ])
  let nextDoc = document
  const createdIds = []
  const ackIds = []
  let skippedTooLarge = false
  let lastCreatedId = null

  for (const entry of entries) {
    if (existingIds.has(entry.id)) {
      ackIds.push(entry.id)
      continue
    }
    const formatted = formatPendingNoteBody({
      title: entry.title,
      body: entry.body,
      fallbackTitle,
    })
    if (!formatted) {
      ackIds.push(entry.id)
      continue
    }
    if (formatted.tooLarge) {
      ackIds.push(entry.id)
      skippedTooLarge = true
      continue
    }
    const timestamp = entry.createdAt ?? now
    const { note, document: updated } = createNoteDocument(nextDoc, {
      id: entry.id,
      body: formatted.body,
      prepend: true,
      createdAt: timestamp,
      modifiedAt: timestamp,
    })
    nextDoc = updated
    existingIds.add(note.id)
    createdIds.push(note.id)
    ackIds.push(note.id)
    lastCreatedId = note.id
  }

  return {
    document: nextDoc,
    createdIds,
    ackIds,
    skippedTooLarge,
    lastCreatedId,
  }
}
