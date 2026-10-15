import { useMemo } from 'react'
import { CircleCheck } from 'lucide-react'
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
 * jumps to the task in place.
 */
export function TasksLibrary({ notes, query, showDone, onShowDone, onToggle, onJump }) {
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
            <button className="task-group-title" onClick={() => onJump(note.id, null)}>
              <span>{displayName(note.name)}</span>
              {open > 0 && <span className="count">{open}</span>}
            </button>
            <ul>
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
                  <button className="task-text" onClick={() => onJump(note.id, task.offset)}>
                    {plain(task.text) || '—'}
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
