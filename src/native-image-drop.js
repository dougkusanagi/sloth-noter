export async function listenNativeImageDrops(
  onDrop,
  loadWebview = () => import('@tauri-apps/api/webview'),
) {
  const { getCurrentWebview } = await loadWebview()
  return getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type !== 'drop') return
    const scale = window.devicePixelRatio || 1
    const { x, y } = event.payload.position
    onDrop(
      event.payload.paths.map((path) => ({ nativePath: path, name: path.split(/[\\/]/).at(-1) })),
      { x: x / scale, y: y / scale },
    )
  })
}

export function routeNativeImageDrop(files, position, onFiles, targetDocument = document) {
  const target = targetDocument.elementFromPoint(position.x, position.y)
  const panel = target?.closest('.image-insert')
  if (panel) {
    panel.dispatchEvent(new CustomEvent('native-image-drop', { detail: files }))
    return 'panel'
  }
  if (target?.closest('.editor-shell')) {
    onFiles(files, position)
    return 'editor'
  }
  return null
}
