export function clipboardImageFiles(clipboard) {
  const files = [...(clipboard?.files ?? [])].filter((file) => file.type.startsWith('image/'))
  if (files.length) return files
  return [...(clipboard?.items ?? [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
}

export async function readNativeClipboard(invoke) {
  const contents = await invoke('clipboard_read')
  if (contents?.kind !== 'image') return contents
  return {
    kind: 'image',
    files: [new File([new Uint8Array(contents.bytes)], 'clipboard.png', { type: 'image/png' })],
  }
}
