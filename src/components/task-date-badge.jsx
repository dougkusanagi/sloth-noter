import { taskDateLabel, taskDates, taskDueState, taskStampText } from '../task-dates.js'

/** All task date stamps (`📅`, `⏳`, `🛫`, `✅`, `❌`) as accessible chips in the active locale. */
export function TaskDateBadge({ text }) {
  const stamps = taskDates(text)
  if (!stamps.length) return null
  return stamps.map((stamp) => {
    const label = taskDateLabel(stamp)
    const state = stamp.kind === 'due' ? taskDueState(stamp.iso) : undefined
    return (
      <time
        key={`${stamp.kind}-${stamp.index}`}
        className="task-date"
        data-kind={stamp.kind}
        data-state={state}
        dateTime={stamp.iso}
        title={label}
        aria-label={label}
      >
        <span aria-hidden="true">{taskStampText(stamp)}</span>
      </time>
    )
  })
}
