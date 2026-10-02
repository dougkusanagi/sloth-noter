import {
  allNotes,
  bytesDataUrl,
  noteImages,
  resolveImage,
  IMAGE_DATA,
  dataUrlBytes,
  replaceDocumentImage,
} from './images.js'
import { validateDocument } from './storage.js'

export function createBackup(document) {
  validateDocument(document)
  return JSON.stringify(document, null, 2)
}

export function readBackup(text) {
  return readBackupBundle(text).document
}

export async function createFullBackup(document, invoke) {
  validateDocument(document)
  const entries = new Map(
    [...noteImages(allNotes(document)), ...(document.assets ?? [])].map((image) => [
      image.src,
      image,
    ]),
  )
  if (invoke)
    for (const name of await invoke('image_list'))
      if (!entries.has(name)) entries.set(name, { name, src: name })
  const images = []
  for (const image of entries.values()) {
    if (/^https?:/i.test(image.src)) continue
    const data =
      invoke && !image.src.startsWith('data:')
        ? bytesDataUrl(await invoke('image_read', { name: image.src }), image.src)
        : await resolveImage(image.src)
    if (!data || !IMAGE_DATA.test(data)) throw new Error(`Image unavailable: ${image.name}`)
    images.push({ name: image.name, src: image.src, data })
  }
  return JSON.stringify({ format: 'sloth-note-backup', version: 1, document, images })
}
export function readBackupBundle(text) {
  const value = JSON.parse(text)
  if (value.format !== 'sloth-note-backup') return { document: validateDocument(value), images: [] }
  if (
    value.version !== 1 ||
    !Array.isArray(value.images) ||
    new Set(value.images.map((image) => image.src)).size !== value.images.length
  )
    throw new Error('Invalid backup images')
  for (const image of value.images) {
    if (
      typeof image.name !== 'string' ||
      typeof image.src !== 'string' ||
      !IMAGE_DATA.test(image.data) ||
      image.data.length > 28 * 1024 * 1024
    )
      throw new Error('Invalid backup image')
    dataUrlBytes(image.data)
  }
  return { document: validateDocument(value.document), images: value.images }
}
export async function restoreBackupImages(bundle, invoke) {
  let document = structuredClone(bundle.document)
  const created = []
  try {
    for (const image of bundle.images) {
      let target = image.data
      if (invoke) {
        const extension = image.data.match(/^data:image\/([^;]+)/)[1].replace('jpeg', 'jpg')
        target = `assets/${crypto.randomUUID()}.${extension}`
        await invoke('image_write', { name: target, bytes: dataUrlBytes(image.data) })
        created.push(target)
      }
      document = replaceDocumentImage(document, image.src, target)
      if (!(document.assets ?? []).some((asset) => asset.src === target))
        document.assets = [...(document.assets ?? []), { name: image.name, src: target }]
    }
    return document
  } catch (error) {
    if (invoke) for (const name of created) await invoke('image_delete', { name }).catch(() => {})
    throw error
  }
}
