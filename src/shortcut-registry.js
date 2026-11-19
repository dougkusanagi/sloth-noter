/**
 * Every keyboard shortcut of the app, in one place, so they can be shown and changed.
 * Keys use the `Shortcut` notation: Ctrl (⌘ on macOS) is implied, except for function keys,
 * and `Alt`/`Shift` are written out, e.g. `Shift+F` or `Alt+T`.
 * Scopes: `app` acts anywhere, `editor` and `block` only inside the note editor.
 */
const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')

const app = (id, keys, label, extra = {}) => ({ id, keys, label, scope: 'app', ...extra })
const editor = (id, keys, label) => ({ id, keys, label, scope: 'editor' })
// Command+Shift+digits belongs to macOS screenshots; Option keeps those combinations free.
const block = (action, key, label) => ({
  id: `block:${action}`,
  action,
  keys: [`Shift+${key}`],
  macKeys: [`Alt+Shift+${key}`],
  label,
  scope: 'block',
})

export const SHORTCUT_ACTIONS = [
  app('mainMenu', ['F10'], 'menu.main'),
  app('newNote', ['T'], 'menu.newNote'),
  app('findNote', ['P'], 'menu.findNote'),
  app('findInNote', ['F'], 'menu.findInNote'),
  app('searchAllNotes', ['Shift+F'], 'menu.searchAllNotes'),
  app('replaceInNote', ['H'], 'find.replace'),
  app('focus', ['Alt+F'], 'focus.toggle'),
  app('closeTab', ['W'], 'tabs.close'),
  app('reopenTab', ['Shift+T'], 'tabs.reopen'),
  app('previousTab', ['PageUp', 'Shift+Tab'], 'tabs.previous'),
  app('nextTab', ['PageDown', 'Tab'], 'tabs.next'),
  ...Array.from({ length: 9 }, (_, index) =>
    app(`tab${index + 1}`, [String(index + 1)], 'tabs.switchNumber', { fixed: true }),
  ),
  app('import', ['O'], 'menu.import'),
  app('export', ['E'], 'menu.export'),
  app('rename', ['F2'], 'menu.rename'),
  app('trashMove', ['Shift+Delete'], 'menu.trashMove'),
  app('images', ['Shift+L'], 'images.title'),
  app('backup', ['Shift+S'], 'menu.backupDownload'),
  app('folder', ['Shift+O'], 'menu.folder'),
  app('commands', ['Shift+P'], 'menu.commands'),
  app('settings', [','], 'menu.settings'),
  app('sidebar', ['Alt+B'], 'sidebar.toggle'),
  app('outline', ['Alt+T'], 'outline.label'),
  app('visual', ['Alt+1'], 'mode.visual'),
  app('source', ['Alt+2'], 'mode.source'),
  app('reading', ['Alt+3'], 'mode.reading'),
  app('board', ['Alt+4'], 'mode.board'),
  app('shortcuts', ['Shift+/'], 'menu.shortcuts'),
  app('smaller', ['-'], 'menu.smaller'),
  app('resetText', ['0'], 'menu.resetText'),
  app('larger', ['+'], 'menu.larger'),
  editor('bold', ['B'], 'format.bold'),
  editor('italic', ['I'], 'format.italic'),
  editor('code', ['`'], 'format.code'),
  editor('strike', ['Shift+X'], 'format.strike'),
  editor('link', ['K'], 'format.link'),
  editor('list', ['Shift+8'], 'format.list'),
  editor('quote', ['Shift+.'], 'format.quote'),
  editor('blockMenu', ['/'], 'block.openActions'),
  block('h2', '2', 'block.h2'),
  block('h3', '3', 'block.h3'),
  block('h4', '4', 'block.h4'),
  block('table', '5', 'block.table'),
  block('image', '6', 'block.image'),
  block('numbered', '7', 'block.numbered'),
  block('code', '`', 'block.code'),
  app('narrower', ['Alt+-'], 'menu.narrower'),
  app('resetWidth', ['Alt+0'], 'menu.resetWidth'),
  app('wider', ['Alt++'], 'menu.wider'),
]

const byId = new Map(SHORTCUT_ACTIONS.map((action) => [action.id, action]))
let overrides = {}

/** User choices from the settings, `{ id: keys }`. Unknown ids are ignored. */
export function setShortcutOverrides(next) {
  overrides = next && typeof next === 'object' ? next : {}
}

export const defaultKeys = (id, mac = isMac()) => {
  const action = byId.get(id)
  return (mac && action?.macKeys) || action?.keys || []
}

/** The keys that run an action now: the user's choice, or the defaults. */
export function keysFor(id, mac = isMac()) {
  const custom = overrides[id]
  return typeof custom === 'string' && custom && byId.has(id) && !byId.get(id).fixed
    ? [custom]
    : defaultKeys(id, mac)
}

/** The keys shown next to an action: the first of `keysFor`. */
export const shortcutKeys = (id) => keysFor(id)[0]

export const isBareKeys = (keys) => /^(F\d+|Esc|Enter|Shift\+Enter)$/.test(keys)

/** Splits `Alt+Shift++` into modifiers and the key. */
export function parseKeys(keys) {
  const parts = keys.endsWith('+')
    ? [...keys.slice(0, -1).split('+').filter(Boolean), '+']
    : keys.split('+')
  const key = parts.pop()
  return { key, alt: parts.includes('Alt'), shift: parts.includes('Shift') }
}

const CODE_KEYS = {
  Slash: '/',
  Period: '.',
  Comma: ',',
  Minus: '-',
  Equal: '+',
  Backquote: '`',
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Backslash: '\\',
  NumpadAdd: '+',
  NumpadSubtract: '-',
}
// The unshifted key of a shifted character on a US keyboard.
const SHIFTED = {
  '?': '/',
  '>': '.',
  '<': ',',
  _: '-',
  '=': '+',
  '~': '`',
  '*': '8',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '(': '9',
  ')': '0',
  '{': '[',
  '}': ']',
  ':': ';',
  '"': "'",
  '|': '\\',
}
const NAMED = { Escape: 'Esc', Del: 'Delete' }

/**
 * The key names an event can stand for: from its physical key (layout-proof for letters,
 * digits and Option on macOS) and from the character it typed (other layouts, such as ABNT).
 */
export function eventKeyNames(event) {
  const names = new Set()
  const code = event.code ?? ''
  const letter = code.match(/^Key([A-Z])$/)
  const digit = code.match(/^(?:Digit|Numpad)(\d)$/)
  if (letter) names.add(letter[1])
  else if (digit) names.add(digit[1])
  else if (CODE_KEYS[code]) names.add(CODE_KEYS[code])
  const key = event.key ?? ''
  if (key.length === 1) {
    names.add(key.toUpperCase())
    if (SHIFTED[key]) names.add(SHIFTED[key])
  } else if (key) names.add(NAMED[key] ?? key)
  return names
}

/** Whether a keydown is exactly `keys`. */
export function matchesKeys(event, keys) {
  if (event.isComposing) return false
  const { key, alt, shift } = parseKeys(keys)
  const modifier = Boolean(event.ctrlKey || event.metaKey)
  if (isBareKeys(keys)) {
    if (modifier || event.altKey || Boolean(event.shiftKey) !== shift) return false
  } else {
    if (!modifier || Boolean(event.altKey) !== alt) return false
    // `+` is typed with Shift on many keyboards, so Ctrl+= and Ctrl+Shift+= both count.
    if (key !== '+' && Boolean(event.shiftKey) !== shift) return false
  }
  return eventKeyNames(event).has(key)
}

/** The action of a scope whose keys match the event, or null. */
export function shortcutAction(event, scope, mac = isMac()) {
  for (const action of SHORTCUT_ACTIONS)
    if (action.scope === scope && keysFor(action.id, mac).some((keys) => matchesKeys(event, keys)))
      return action
  return null
}

/** The `Shortcut` notation for a keydown, for recording a new shortcut; null if incomplete. */
export function keysFromEvent(event) {
  if (['Control', 'Meta', 'Alt', 'Shift', 'AltGraph'].includes(event.key)) return null
  const names = [...eventKeyNames(event)]
  const code = event.code ?? ''
  // Prefer the physical key, so Shift and Option do not change the name.
  const key =
    code.match(/^Key([A-Z])$/)?.[1] ??
    code.match(/^(?:Digit|Numpad)(\d)$/)?.[1] ??
    CODE_KEYS[code] ??
    names[names.length - 1]
  if (!key) return null
  const bare = /^F\d+$/.test(key)
  if (!bare && !(event.ctrlKey || event.metaKey)) return null
  const keys = [event.altKey && 'Alt', event.shiftKey && 'Shift', key].filter(Boolean).join('+')
  if (bare && (event.ctrlKey || event.metaKey || event.altKey)) return null
  return keys
}

/** The other action that already uses `keys` in a scope that can fire together, or null. */
export function shortcutConflict(id, keys) {
  const scopes = { app: ['app', 'editor', 'block'], editor: ['app', 'editor', 'block'] }
  const own = byId.get(id)
  const reach = scopes[own?.scope] ?? ['app', 'editor', 'block']
  return (
    SHORTCUT_ACTIONS.find(
      (action) =>
        action.id !== id && reach.includes(action.scope) && keysFor(action.id).includes(keys),
    ) ?? null
  )
}
