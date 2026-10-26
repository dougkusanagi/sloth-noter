import { BLOCK_SHORTCUTS, EDITOR_SHORTCUTS, blockKeys } from './editor-shortcuts.js'

export const SHORTCUTS = [
  ['F10', 'menu.main'],
  ['T', 'menu.newNote'],
  ['P', 'menu.findNote'],
  ['F', 'menu.findInNote'],
  ['Shift+F', 'menu.searchAllNotes'],
  ['H', 'find.replace'],
  ['Alt+F', 'focus.toggle'],
  ['W', 'tabs.close'],
  ['Shift+T', 'tabs.reopen'],
  ['PageUp', 'tabs.previous'],
  ['PageDown', 'tabs.next'],
  ['Shift+Tab', 'tabs.previous'],
  ['Tab', 'tabs.next'],
  ...Array.from({ length: 9 }, (_, index) => [String(index + 1), 'tabs.switchNumber']),
  ['O', 'menu.import'],
  ['E', 'menu.export'],
  ['F2', 'menu.rename'],
  ['Shift+Delete', 'menu.trashMove'],
  ['Shift+L', 'images.title'],
  ['Shift+S', 'menu.backupDownload'],
  ['Shift+O', 'menu.folder'],
  ['Shift+P', 'menu.commands'],
  [',', 'menu.settings'],
  ['Alt+B', 'sidebar.toggle'],
  ['Alt+1', 'mode.visual'],
  ['Alt+2', 'mode.source'],
  ['Alt+3', 'mode.reading'],
  ['Shift+/', 'menu.shortcuts'],
  ['-', 'menu.smaller'],
  ['0', 'menu.resetText'],
  ['+', 'menu.larger'],
  ...EDITOR_SHORTCUTS,
  ...BLOCK_SHORTCUTS.map(([, label, action]) => [blockKeys(action), label]),
  ['Alt+-', 'menu.narrower'],
  ['Alt+0', 'menu.resetWidth'],
  ['Alt++', 'menu.wider'],
]
export function appShortcut(event) {
  if (
    event.key === 'F10' &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.isComposing
  )
    return 'mainMenu'
  if (event.key === 'F2' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
    return 'rename'
  if (!(event.ctrlKey || event.metaKey) || event.isComposing) return null
  const key = event.key.toLowerCase()
  if (event.altKey && !event.shiftKey)
    return event.code === 'KeyB'
      ? 'sidebar'
      : ({ 1: 'visual', 2: 'source', 3: 'reading', f: 'focus', b: 'sidebar' }[key] ?? null)
  if (event.shiftKey && !event.altKey)
    return (
      {
        f: 'searchAllNotes',
        p: 'commands',
        t: 'reopenTab',
        tab: 'previousTab',
        delete: 'trashMove',
        l: 'images',
        s: 'backup',
        o: 'folder',
        '?': 'shortcuts',
        '/': 'shortcuts',
      }[key] ?? null
    )
  if (event.altKey || event.shiftKey) return null
  if (/^[1-9]$/.test(key)) return `tab${key}`
  return (
    {
      pageup: 'previousTab',
      pagedown: 'nextTab',
      tab: 'nextTab',
      t: 'newNote',
      p: 'findNote',
      f: 'findInNote',
      h: 'replaceInNote',
      w: 'closeTab',
      o: 'import',
      e: 'export',
      ',': 'settings',
    }[key] ?? null
  )
}
