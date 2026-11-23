import { EditorView, Decoration, WidgetType } from '@codemirror/view'
import { taskSummary } from '../task-note.js'
import { currentLanguage, t } from '../i18n.js'
import { activeNoteId, taskNotes } from './live-decorations.js'

/** The line of the note's H1 title (after the properties block), or null. */
function titleLine(doc) {
  let line = 1
  if (doc.line(1).text === '---') {
    for (line = 2; line <= doc.lines && doc.line(line).text !== '---'; line++);
    line++
  }
  for (; line <= doc.lines; line++) {
    const text = doc.line(line).text
    if (/^#\s/.test(text)) return doc.line(line)
    if (text.trim()) return null
  }
  return null
}

class SummaryWidget extends WidgetType {
  constructor(summary) {
    super()
    this.summary = summary
    this.key = JSON.stringify(summary)
  }
  eq(other) {
    return other.key === this.key
  }
  toDOM() {
    const box = document.createElement('div')
    box.className = 'cm-task-summary'
    box.setAttribute('role', 'note')
    box.setAttribute('aria-label', t('taskSummary.label'))
    box.contentEditable = 'false'
    const group = (className, items) => {
      if (!items.length) return
      const element = document.createElement('div')
      element.className = className
      element.append(...items)
      box.append(element)
    }
    group(
      'cm-task-summary-dates',
      this.summary.dates.map((text) => {
        const item = document.createElement('span')
        item.textContent = text
        return item
      }),
    )
    group(
      'cm-task-summary-counts',
      this.summary.counts.map(({ title, count }) => {
        const chip = document.createElement('span')
        chip.className = 'cm-task-summary-chip'
        if (!count) chip.dataset.empty = ''
        const number = document.createElement('b')
        number.textContent = String(count)
        chip.append(number, ' ', title)
        return chip
      }),
    )
    return box
  }
  ignoreEvent() {
    return true
  }
}

function summaryParts(summary) {
  const date = new Intl.DateTimeFormat(currentLanguage(), { dateStyle: 'medium' })
  const time = new Intl.DateTimeFormat(currentLanguage(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  return {
    dates: [
      summary.created && t('taskSummary.created', { date: date.format(summary.created) }),
      summary.modified && t('taskSummary.modified', { date: time.format(summary.modified) }),
    ].filter(Boolean),
    counts: summary.columns.map((column) => ({ title: column.title, count: column.count })),
  }
}

/** A task note (ADR 0033) shows under its title when it was created, changed and its counts. */
export const taskSummaryLine = EditorView.decorations.compute(
  ['doc', taskNotes, activeNoteId],
  (state) => {
    const id = state.facet(activeNoteId)
    const note = state.facet(taskNotes).find((item) => item.id === id)
    const summary = taskSummary(state.doc.toString(), note?.modifiedAt)
    const line = summary && titleLine(state.doc)
    if (!line) return Decoration.none
    return Decoration.set([
      Decoration.widget({
        widget: new SummaryWidget(summaryParts(summary)),
        block: true,
        side: 1,
      }).range(line.to),
    ])
  },
)
