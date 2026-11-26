import { applyStatus, noteTasks, taskSettings } from '../tasks.js'
import { displayName } from '../note-title.js'
import { updateMobileNote } from './note-actions.js'

export const WIDGET_MAX_TASKS = 8

/**
 * Selects the pinned note to display in the Android home-screen widget and builds a lightweight
 * JSON-serializable snapshot of its visible (non-archived, non-canceled) tasks.
 */
export function buildPinnedTasksWidgetSnapshot(document, { maxTasks = WIDGET_MAX_TASKS } = {}) {
  const notes = Array.isArray(document?.notes) ? document.notes : []
  const pinned = notes.filter((note) => note && note.pinned)
  if (pinned.length === 0) {
    return { noteId: null, title: '', tasks: [], totalCount: 0 }
  }

  let chosen = null
  let chosenTasks = []
  for (const note of pinned) {
    const visible = noteTasks(note.body ?? '').filter(
      (task) => !task.archived && task.status !== 'canceled',
    )
    if (visible.length > 0) {
      chosen = note
      chosenTasks = visible
      break
    }
  }

  if (!chosen) {
    chosen = pinned[0]
    chosenTasks = []
  }

  const firstLine = chosen.name || (chosen.body ?? '').split('\n')[0] || ''
  return {
    noteId: chosen.id,
    title: displayName(firstLine),
    totalCount: chosenTasks.length,
    tasks: chosenTasks.slice(0, maxTasks).map((task) => ({
      line: task.line,
      status: task.status,
      done: task.done,
      text: task.text,
    })),
  }
}

/**
 * Parses pending widget toggle operations returned by `SlothSystem.takePendingWidgetToggles()`.
 */
export function parsePendingWidgetToggles(raw) {
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
    if (typeof item.noteId !== 'string' || !item.noteId.trim()) continue
    const targetStatus = item.targetStatus === 'done' ? 'done' : item.targetStatus === 'todo' ? 'todo' : null
    if (!targetStatus) continue
    const line = Number.isInteger(item.line) && item.line > 0 ? item.line : null
    const text = typeof item.text === 'string' ? item.text.trim() : ''
    result.push({
      id: item.id.trim(),
      noteId: item.noteId.trim(),
      line,
      text,
      targetStatus,
    })
  }
  return result
}

/**
 * Applies pending widget task toggles to the document using the exact `tasks.js` rules
 * (`applyStatus` + `taskSettings`). Returns the updated document and the IDs safe to acknowledge.
 */
export function applyWidgetToggles(document, rawToggles, options = taskSettings) {
  const toggles = parsePendingWidgetToggles(rawToggles)
  let nextDoc = document
  const ackIds = []
  let changedCount = 0

  for (const toggle of toggles) {
    const note = (nextDoc?.notes ?? []).find((n) => n.id === toggle.noteId)
    if (!note) {
      ackIds.push(toggle.id)
      continue
    }
    const tasks = noteTasks(note.body ?? '').filter(
      (task) => !task.archived && task.status !== 'canceled',
    )
    const match =
      tasks.find((task) => task.line === toggle.line && (!toggle.text || task.text === toggle.text)) ??
      (toggle.text ? tasks.find((task) => task.text === toggle.text) : null) ??
      tasks.find((task) => task.line === toggle.line)

    if (!match) {
      ackIds.push(toggle.id)
      continue
    }

    const updatedBody = applyStatus(note.body ?? '', match.mark, toggle.targetStatus, options)
    if (updatedBody !== note.body) {
      nextDoc = updateMobileNote(nextDoc, note.id, updatedBody)
      changedCount += 1
    }
    ackIds.push(toggle.id)
  }

  return {
    document: nextDoc,
    ackIds,
    changedCount,
  }
}
