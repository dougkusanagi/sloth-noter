import { formatTaskDate, taskDate, taskDateLabel } from '../task-dates.js'

/** The `✅ AAAA-MM-DD` suffix of a task as a small date badge in the active locale. */
export function TaskDateBadge({ text }) {
  const stamp = taskDate(text)
  if (!stamp) return null
  const label = taskDateLabel(stamp)
  return (
    <time
      className="task-date"
      data-kind={stamp.kind}
      dateTime={stamp.iso}
      title={label}
      aria-label={label}
    >
      <span aria-hidden="true">{formatTaskDate(stamp.iso)}</span>
    </time>
  )
}
