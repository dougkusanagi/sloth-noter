export const SHORTCUTS = [
  ['T', 'menu.newNote'],
  ['P', 'menu.findNote'],
  ['F', 'menu.findInNote'],
  ['W', 'tabs.close'],
  ['I', 'menu.import'],
  ['E', 'menu.export'],
  ['Shift+R', 'menu.rename'],
  ['Shift+Delete', 'menu.trashMove'],
  ['Shift+I', 'images.title'],
  ['Alt+I', 'images.import'],
  ['Shift+S', 'menu.backupDownload'],
  ['Shift+O', 'menu.folder'],
  ['\\', 'sidebar.toggle'],
  ['Alt+1', 'mode.visual'],
  ['Alt+2', 'mode.source'],
  ['Alt+3', 'mode.reading'],
  ['Shift+/', 'menu.shortcuts'],
]
export function appShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.isComposing) return null
  const key = event.key.toLowerCase()
  if (event.altKey && !event.shiftKey)
    return { 1: 'visual', 2: 'source', 3: 'reading', i: 'addImage' }[key] ?? null
  if (event.shiftKey && !event.altKey)
    return (
      {
        r: 'rename',
        delete: 'trashMove',
        i: 'images',
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
      '\\': 'sidebar',
    }[key] ?? null
  )
}
