import { useMemo, useState } from 'react'
import { ChevronDown, CircleCheck, ExternalLink } from 'lucide-react'
import { noteTasks } from '../tasks.js'
import { displayName } from '../note-title.js'
import { t } from '../i18n.js'

/** Inline Markdown reduced to its text, so a task reads cleanly in the list. */
function plain(text) {
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
  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    return notes
      .map((note) => {
        const tasks = noteTasks(note.body)
        return {
          note,
          open: tasks.filter((task) => !task.done).length,
          tasks: tasks.filter(
            (task) =>
              (showDone || !task.done) &&
              (!needle ||
                task.text.toLocaleLowerCase().includes(needle) ||
                note.name.toLocaleLowerCase().includes(needle)),
          ),
        }
      })
      .filter((group) => group.tasks.length)
  }, [notes, query, showDone])
  return (
    <section className="tasks-library" aria-label={t('tasks.title')}>
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
                  style={{ '--depth': Math.min(3, Math.floor(task.depth / 2)) }}
                >
                  <input
                    type="checkbox"
                    className="task-checkbox"
                    checked={task.done}
                    aria-label={plain(task.text) || t('task.open')}
                    onChange={() => onToggle(note.id, task.mark)}
                  />
                  <span className="task-text">{plain(task.text) || '—'}</span>
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
