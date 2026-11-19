import { formatSelection } from './format-selection.js'
import { SHORTCUT_ACTIONS, keysFor, shortcutAction } from './shortcut-registry.js'

/** Default block shortcuts as `[keys, label, block]`. */
export const BLOCK_SHORTCUTS = SHORTCUT_ACTIONS.filter((item) => item.scope === 'block').map(
  (item) => [item.keys[0], item.label, item.action],
)

const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')

/** The keys of a block or of the list and quote formats, as shown in menus. */
export function blockKeys(action, mac = isMac()) {
  if (['list', 'quote'].includes(action)) return keysFor(action, mac)[0]
  return keysFor(`block:${action}`, mac)[0]
}

/** The block a keydown turns the current line into (`h2`, `code`…), or null. */
export const blockShortcut = (event, mac = isMac()) =>
  shortcutAction(event, 'block', mac)?.action ?? null

/** Maps a keydown to an editor action (`bold`, `blockMenu`…), or null. */
export function formatShortcut(event) {
  return shortcutAction(event, 'editor')?.id ?? null
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
  if (!['bold', 'italic', 'code', 'strike', 'link', 'list', 'quote'].includes(action)) return null
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
