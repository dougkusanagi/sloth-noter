import { useMemo, useState } from 'react'
import { ChevronDown, CircleCheck, ExternalLink } from 'lucide-react'
import { resolvedTasks, taskHeadings, tasksProgress } from '../tasks.js'
import { progressLabel, progressShares } from '../progress-badge.js'
import { DEFAULT_TASK_FILTERS } from './library-menus.jsx'
import { stripTaskDates, taskDates, taskDueState, taskMatches } from '../task-dates.js'
import { TaskDateBadge } from './task-date-badge.jsx'
import { displayName } from '../note-title.js'
import { t } from '../i18n.js'

/** Inline Markdown reduced to its text, so a task reads cleanly in the list. */
export function plain(text) {
  return text
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => label ?? target)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, '$2')
    .replace(/(?<![\w*])[*_](.+?)[*_](?![\w*])/g, '$1')
}

/** The same done/total pill the editor draws after a heading with tasks. */
export function ProgressPill({ done, total, doing = 0, waiting = 0 }) {
  if (!total) return null
  const share = progressShares(done, total, doing, waiting)
  return (
    <span
      className="section-progress"
      role="img"
      aria-label={progressLabel(done, total, doing, waiting)}
      data-complete={done === total ? '' : undefined}
    >
      <span className="section-progress-bar" aria-hidden="true">
        <span className="section-progress-done" style={{ width: `${share.done}%` }} />
        <span className="section-progress-doing" style={{ width: `${share.doing}%` }} />
        <span className="section-progress-waiting" style={{ width: `${share.waiting}%` }} />
      </span>
      <span className="section-progress-count" data-count={`${done}/${total}`} />
    </span>
  )
}

function TaskRow({ note, task, onToggle, onJump }) {
  return (
    <li
      className="task-row"
      data-done={task.done || undefined}
      data-status={task.status}
      style={{ '--depth': Math.min(3, Math.floor(task.depth / 2)) }}
    >
      <input
        type="checkbox"
        className="task-checkbox"
        data-status={task.status}
        checked={task.done}
        ref={(input) => {
          if (input) input.indeterminate = task.partial
        }}
        aria-checked={task.partial ? 'mixed' : task.done}
        disabled={Boolean(task.progress)}
        aria-label={plain(task.text) || t('task.open')}
        onChange={() => onToggle(note.id, task.mark)}
      />
      <span className="task-text">{plain(stripTaskDates(task.text)) || '—'}</span>
      <TaskDateBadge text={task.text} />
      <button
        type="button"
        className="task-open-note"
        aria-label={`${t('tasks.openTask')}: ${plain(task.text) || '—'}`}
        title={t('tasks.openTask')}
        onClick={() => onJump(note.id, task.offset)}
      >
        <ExternalLink size={14} aria-hidden="true" />
      </button>
    </li>
  )
}

/**
 * Every task across the notes, grouped by note and then by the note's headings, each with
 * the same progress pill the note shows. Checking one edits its note; dedicated buttons
 * open the note or jump to a task. Filters come from the caller (`TaskFilterMenu`).
 */
export function TasksLibrary({ notes, query, filters: given, onToggle, onJump }) {
  const filters = { ...DEFAULT_TASK_FILTERS, ...given }
  const { status, due: dueFilter, sortByDue, showDone } = filters
  const [collapsed, setCollapsed] = useState(new Set())
  const groups = useMemo(() => {
    const needle = query.trim()
    const dueIso = (text) => taskDates(text).find((stamp) => stamp.kind === 'due')?.iso ?? null
    const matchesDue = (text) => {
      if (dueFilter === 'all') return true
      const iso = dueIso(text)
      if (!iso) return false
      if (dueFilter === 'any') return true
      const state = taskDueState(iso)
      if (dueFilter === 'overdue') return state === 'overdue'
      if (dueFilter === 'today') return state === 'today'
      if (dueFilter === 'upcoming') return state === 'soon' || state === 'future'
      return true
    }
    return notes
      .map((note) => {
        const tasks = resolvedTasks(note.body, notes)
        const filtered = tasks.filter(
          (task) =>
            (showDone || (!task.done && task.status !== 'canceled')) &&
            (status === 'all' || task.status === status) &&
            matchesDue(task.text) &&
            (!needle ||
              taskMatches(task.text, needle) ||
              note.name.toLocaleLowerCase().includes(needle.toLocaleLowerCase())),
        )
        if (sortByDue) {
          filtered.sort((a, b) => {
            const da = dueIso(a.text) ?? '9999-99-99'
            const db = dueIso(b.text) ?? '9999-99-99'
            return da.localeCompare(db)
          })
        }
        // Sections follow the note's order; each counts all of its tasks, as the note does.
        const headings = taskHeadings(note.body, tasks)
        const sections = []
        for (const task of filtered) {
          // Sorting by due date reads across sections, so it keeps one flat list.
          const heading = sortByDue ? null : (headings.get(task.line) ?? null)
          let section = sections.find((item) => item.heading?.line === heading?.line)
          if (!section) {
            section = {
              heading,
              tasks: [],
              progress: tasksProgress(
                tasks.filter(
                  (item) => (headings.get(item.line)?.line ?? null) === (heading?.line ?? null),
                ),
              ),
            }
            sections.push(section)
          }
          section.tasks.push(task)
        }
        return {
          note,
          progress: tasksProgress(tasks),
          sections,
          count: filtered.length,
        }
      })
      .filter((group) => group.count)
  }, [notes, query, showDone, status, dueFilter, sortByDue])
  return (
    <section className="tasks-library" aria-label={t('tasks.title')}>
      {groups.length ? (
        groups.map(({ note, progress, sections }) => (
          <div className="task-group" key={note.id} role="group" aria-label={note.name}>
            <div className="task-group-header">
              <button
                type="button"
                className="task-group-title"
                aria-expanded={!collapsed.has(note.id)}
                aria-controls={`tasks-${note.id}`}
                onClick={() =>
                  setCollapsed((previous) => {
                    const next = new Set(previous)
                    if (next.has(note.id)) next.delete(note.id)
                    else next.add(note.id)
                    return next
                  })
                }
              >
                <ChevronDown size={14} aria-hidden="true" />
                <span>{displayName(note.name)}</span>
              </button>
              <ProgressPill {...progress} />
              <button
                type="button"
                className="task-open-note"
                aria-label={`${t('tasks.openNote')}: ${displayName(note.name)}`}
                title={t('tasks.openNote')}
                onClick={() => onJump(note.id, null)}
              >
                <ExternalLink size={14} aria-hidden="true" />
              </button>
            </div>
            <div id={`tasks-${note.id}`} hidden={collapsed.has(note.id)}>
              {sections.map(({ heading, tasks, progress: sectionProgress }) => (
                <div className="task-section" key={heading?.line ?? 0}>
                  {heading && (
                    <p className="task-section-title">
                      <span>{plain(heading.title) || '—'}</span>
                      <ProgressPill {...sectionProgress} />
                    </p>
                  )}
                  <ul>
                    {tasks.map((task) => (
                      <TaskRow
                        key={task.mark}
                        note={note}
                        task={task}
                        onToggle={onToggle}
                        onJump={onJump}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">
          <CircleCheck size={22} aria-hidden="true" />
          <p>{query ? t('library.noResults') : t('tasks.empty')}</p>
        </div>
      )}
    </section>
  )
}
