import { useMemo, useState } from 'react'
import { ChevronDown, CircleCheck, ExternalLink } from 'lucide-react'
import { resolvedTasks } from '../tasks.js'
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

/**
 * Every task across the notes, grouped by note. Checking one edits its note; the text
 * is plain text; dedicated buttons open the note or jump to a task.
 */
export function TasksLibrary({ notes, query, showDone, onShowDone, onToggle, onJump }) {
  const [collapsed, setCollapsed] = useState(new Set())
  const [status, setStatus] = useState('all')
  const [dueFilter, setDueFilter] = useState('all')
  const [sortByDue, setSortByDue] = useState(false)
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
        return {
          note,
          open: tasks.filter((task) => !task.done && task.status !== 'canceled').length,
          tasks: filtered,
        }
      })
      .filter((group) => group.tasks.length)
  }, [notes, query, showDone, status, dueFilter, sortByDue])
  return (
    <section className="tasks-library" aria-label={t('tasks.title')}>
      <label className="tasks-filter tasks-status-filter">
        {t('tasks.status')}
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">{t('tasks.statusAll')}</option>
          <option value="doing">{t('task.status.doing')}</option>
          <option value="waiting">{t('task.status.waiting')}</option>
        </select>
      </label>
      <label className="tasks-filter tasks-due-filter">
        {t('tasks.due')}
        <select value={dueFilter} onChange={(event) => setDueFilter(event.target.value)}>
          <option value="all">{t('tasks.dueAll')}</option>
          <option value="overdue">{t('tasks.dueOverdue')}</option>
          <option value="today">{t('tasks.dueToday')}</option>
          <option value="upcoming">{t('tasks.dueUpcoming')}</option>
          <option value="any">{t('tasks.dueAny')}</option>
        </select>
      </label>
      <label className="tasks-filter">
        <input
          type="checkbox"
          className="switch small"
          checked={sortByDue}
          onChange={(event) => setSortByDue(event.target.checked)}
        />
        {t('tasks.sortByDue')}
      </label>
      <label className="tasks-filter">
        <input
          type="checkbox"
          className="switch small"
          checked={showDone}
          onChange={(event) => onShowDone(event.target.checked)}
        />
        {t('tasks.showDone')}
      </label>
      {groups.length ? (
        groups.map(({ note, open, tasks }) => (
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
                {open > 0 && <span className="count">{open}</span>}
              </button>
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
            <ul id={`tasks-${note.id}`} hidden={collapsed.has(note.id)}>
              {tasks.map((task) => (
                <li
                  key={task.mark}
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
              ))}
            </ul>
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
