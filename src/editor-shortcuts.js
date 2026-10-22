import { formatSelection } from './format-selection.js'

/**
 * Formatting shortcuts shared with other Markdown editors (Obsidian, Typora, Google Docs).
 * They only act inside the text editor, so they never compete with the app shortcuts.
 * Entries: [keys, label key] in the shape of the SHORTCUTS list.
 */
export const EDITOR_SHORTCUTS = [
  ['B', 'format.bold'],
  ['I', 'format.italic'],
  ['`', 'format.code'],
  ['Shift+X', 'format.strike'],
  ['K', 'format.link'],
  ['Shift+8', 'format.list'],
  ['Shift+.', 'format.quote'],
]

/** Maps a keydown to a formatting action, or null. */
export function formatShortcut(event) {
  if (event.isComposing || !(event.ctrlKey || event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  if (!event.shiftKey)
    return (
      { b: 'bold', i: 'italic', k: 'link', '`': 'code' }[key] ??
      (event.code === 'Backquote' ? 'code' : null)
    )
  if (event.code === 'Digit8' || key === '*') return 'list'
  if (event.code === 'Period' || key === '>') return 'quote'
  if (key === 'x') return 'strike'
  return null
}

const PAIRS = { bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'], strike: ['~~', '~~'] }

/**
 * Edit for a shortcut: `{ from, to, insert, selectionFrom, selectionTo }` or null.
 * With nothing selected, an inline mark inserts an empty pair and puts the cursor inside.
 */
export function shortcutEdit(text, from, to, action) {
  const edit = rawEdit(text, from, to, action)
  return edit && from === to ? { ...edit, selectionTo: edit.selectionFrom } : edit
}

function rawEdit(text, from, to, action) {
  if (action === 'list' || action === 'quote') {
    // Block marks apply to the current line even when nothing is selected.
    const end = Math.max(to, from + (from === to ? 1 : 0))
    const edit = formatSelection(text, from, Math.min(end, text.length) || from, action)
    if (edit || from !== to) return edit
    const prefix = action === 'list' ? '- ' : '> '
    const start = text.lastIndexOf('\n', from - 1) + 1
    return {
      from: start,
      to: start,
      insert: prefix,
      selectionFrom: from + prefix.length,
      selectionTo: from + prefix.length,
    }
  }
  if (action === 'link') {
    // A selection already inside a link is unlinked; otherwise the cursor lands in the URL.
    const unlink = from === to ? null : formatSelection(text, from, to, 'link')
    if (unlink) return unlink
    const selected = text.slice(from, to)
    const cursor = from + (from === to ? 1 : selected.length + 3)
    return { from, to, insert: `[${selected}]()`, selectionFrom: cursor, selectionTo: cursor }
  }
  return markEdit(text, from, to, action)
}

function markEdit(text, from, to, action) {
  const [open, close] = PAIRS[action] ?? []
  if (!open) return null
  const around = (a, b) =>
    text.slice(a - open.length, a) === open && text.slice(b, b + close.length) === close
  if (from !== to && (action === 'bold' || action === 'italic'))
    return emphasisEdit(text, from, to, action)
  if (from !== to && action !== 'strike') return formatSelection(text, from, to, action)
  const selected = text.slice(from, to)
  if (around(from, to))
    return {
      from: from - open.length,
      to: to + close.length,
      insert: selected,
      selectionFrom: from - open.length,
      selectionTo: to - open.length,
    }
  return {
    from,
    to,
    insert: open + selected + close,
    selectionFrom: from + open.length,
    selectionTo: to + open.length,
  }
}

/**
 * Bold and italic share the `*` marker, so they are toggled as one run of 0-3 asterisks
 * around the text: 1 = italic, 2 = bold, 3 = both. Bold adds or removes 2, italic 1.
 */
function emphasisEdit(text, from, to, action) {
  let start = from,
    end = to
  // A selection that includes the markers is treated as the text between them.
  while (start < end && text[start] === '*') start++
  while (end > start && text[end - 1] === '*') end--
  if (start === end) return null
  let before = 0,
    after = 0
  while (before < 3 && text[start - before - 1] === '*') before++
  while (after < 3 && text[end + after] === '*') after++
  const run = Math.min(before, after)
  const bit = action === 'bold' ? 2 : 1
  const next = run & bit ? run - bit : run + bit
  const marks = '*'.repeat(next)
  return {
    from: start - run,
    to: end + run,
    insert: marks + text.slice(start, end) + marks,
    selectionFrom: start - run + next,
    selectionTo: end - run + next,
  }
}
