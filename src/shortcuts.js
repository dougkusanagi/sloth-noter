export const SHORTCUTS = [
  ['T', 'menu.newNote'],
  ['P', 'menu.findNote'],
  ['F', 'menu.findInNote'],
  ['W', 'tabs.close'],
  ['I', 'menu.import'],
  ['E', 'menu.export'],
  ['F2', 'menu.rename'],
  ['Shift+Delete', 'menu.trashMove'],
  ['Shift+L', 'images.title'],
  ['Shift+S', 'menu.backupDownload'],
  ['Shift+O', 'menu.folder'],
  ['K', 'menu.commands'],
  [',', 'menu.settings'],
  ['\\', 'sidebar.toggle'],
  ['Alt+1', 'mode.visual'],
  ['Alt+2', 'mode.source'],
  ['Alt+3', 'mode.reading'],
  ['Shift+/', 'menu.shortcuts'],
]
export function appShortcut(event) {
  if (event.key === 'F2' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)
    return 'rename'
  if (!(event.ctrlKey || event.metaKey) || event.isComposing) return null
  const key = event.key.toLowerCase()
  if (event.altKey && !event.shiftKey)
    return { 1: 'visual', 2: 'source', 3: 'reading' }[key] ?? null
  if (event.shiftKey && !event.altKey)
    return (
      {
        delete: 'trashMove',
        l: 'images',
        s: 'backup',
        o: 'folder',
        '?': 'shortcuts',
        '/': 'shortcuts',
      }[key] ?? null
    )
  if (event.altKey || event.shiftKey) return null
  return (
    {
      t: 'newNote',
      p: 'findNote',
      f: 'findInNote',
      w: 'closeTab',
      i: 'import',
      e: 'export',
      k: 'commands',
      ',': 'settings',
      '\\': 'sidebar',
    }[key] ?? null
  )
}
