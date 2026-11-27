import { noteTasks } from './tasks.js'

/**
 * Builds a consolidated Project Hub summary from document groups and notes (C5).
 * Each group becomes a project card with note count, task progress, and last activity timestamp.
 */
export function buildProjectHub(document) {
  const groups = Array.isArray(document?.groups) ? document.groups : []
  const notes = Array.isArray(document?.notes) ? document.notes : []

  const projects = groups.map((group) => {
    const groupNotes = notes.filter((note) => note.groupId === group.id)
    let doneTasks = 0
    let totalTasks = 0
    let pinnedCount = 0
    let lastModifiedAt = 0

    for (const note of groupNotes) {
      if (note.pinned) pinnedCount += 1
      if (typeof note.modifiedAt === 'number' && note.modifiedAt > lastModifiedAt) {
        lastModifiedAt = note.modifiedAt
      }
      const visible = noteTasks(note.body ?? '').filter(
        (task) => !task.archived && task.status !== 'canceled',
      )
      totalTasks += visible.length
      doneTasks += visible.filter((task) => task.done).length
    }

    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
    return {
      id: group.id,
      name: group.name,
      noteCount: groupNotes.length,
      pinnedCount,
      doneTasks,
      totalTasks,
      progress,
      lastModifiedAt,
    }
  })

  return projects.sort((a, b) => b.lastModifiedAt - a.lastModifiedAt)
}
