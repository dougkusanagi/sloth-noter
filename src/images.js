import { desktopInvoke } from './persistence-desktop.js'
import { imageReferences, replaceImageSource, normalizeImageSource } from './markdown-model.js'
import { t } from './i18n.js'

export const IMAGE_TYPES = /\.(png|jpe?g|gif|webp|avif|bmp)$/i
export const IMAGE_DATA = /^data:image\/(png|jpeg|gif|webp|avif|bmp);base64,[A-Za-z0-9+/=]+$/i
const cache = new Map()
let generation = 0
let cacheSize = 0
const weights = new Map()
export function clearImageCache() {
  generation++
  cache.clear()
  weights.clear()
  cacheSize = 0
}
const mime = (name) =>
  ({ jpg: 'jpeg' })[name.split('.').at(-1).toLowerCase()] ?? name.split('.').at(-1).toLowerCase()
export function bytesDataUrl(bytes, name) {
  const chunks = []
  for (let at = 0; at < bytes.length; at += 8192)
    chunks.push(String.fromCharCode(...bytes.slice(at, at + 8192)))
  return `data:image/${mime(name)};base64,${btoa(chunks.join(''))}`
}
export function dataUrlBytes(src) {
  if (!IMAGE_DATA.test(src)) throw new Error(t('images.invalid'))
  const binary = atob(src.slice(src.indexOf(',') + 1))
  if (binary.length > 20 * 1024 * 1024) throw new Error(t('images.invalid'))
  return Array.from(binary, (character) => character.charCodeAt(0))
}
export async function resolveImage(src) {
  src = normalizeImageSource(src)
  if (!src) return null
  if (/^https?:\/\//i.test(src) || IMAGE_DATA.test(src)) return src
  if (cache.has(src)) return cache.get(src)
  const version = generation
  const pending = (async () => {
    const invoke = await desktopInvoke()
    if (!invoke) return null
    const bytes = await invoke('image_read', { name: decodeURIComponent(src.replace(/^\.\//, '')) })
    const result = bytesDataUrl(bytes, src)
    if (version !== generation) return result
    weights.set(src, result.length)
    cacheSize += result.length
    while (cacheSize > 40 * 1024 * 1024 && cache.size > 1) {
      const key = cache.keys().next().value
      cacheSize -= weights.get(key) ?? 0
      weights.delete(key)
      cache.delete(key)
    }
    return result
  })()
  cache.set(src, pending)
  pending.catch(() => {
    if (cache.get(src) === pending) cache.delete(src)
  })
  return pending
}
export async function importImage(file, invoke) {
  if (file.nativePath) {
    if (!invoke) throw new Error(t('images.invalid'))
    return invoke('image_import_drop', { path: file.nativePath })
  }
  if (!IMAGE_TYPES.test(file.name) || file.size > 20 * 1024 * 1024)
    throw new Error(t('images.invalid'))
  const bytes = new Uint8Array(await file.arrayBuffer())
  const head = Array.from(bytes.slice(0, 16))
  const ascii = String.fromCharCode(...head)
  const valid =
    ascii.startsWith('\x89PNG\r\n\x1a\n') ||
    ascii.startsWith('GIF87a') ||
    ascii.startsWith('GIF89a') ||
    (head[0] === 255 && head[1] === 216 && head[2] === 255) ||
    (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') ||
    ascii.startsWith('BM') ||
    (ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8)))
  if (!valid) throw new Error(t('images.invalid'))
  if (invoke) {
    const readable = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
    const name = `assets/${crypto.randomUUID()}-${readable}`
    await invoke('image_write', { name, bytes: Array.from(bytes) })
    return name
  }
  return bytesDataUrl(bytes, file.name)
}
export function allNotes(document) {
  return [...document.notes, ...document.trash.map((entry) => entry.note)]
}
export function noteImages(notes) {
  const found = new Map()
  for (const note of notes)
    for (const reference of imageReferences(note.body)) {
      const image = { ...reference, src: normalizeImageSource(reference.src) }
      const existing = found.get(image.src)
      if (existing) {
        if (!existing.noteIds.includes(note.id)) existing.noteIds.push(note.id)
      } else
        found.set(image.src, { name: image.name || note.name, src: image.src, noteIds: [note.id] })
    }
  return [...found.values()]
}
export function replaceDocumentImage(document, source, target) {
  const replace = (note) => {
    const body = replaceImageSource(note.body, source, target)
    return body === note.body ? note : { ...note, body, revision: note.revision + 1 }
  }
  return {
    ...document,
    notes: document.notes.map(replace),
    trash: document.trash.map((entry) => ({ ...entry, note: replace(entry.note) })),
    assets: (document.assets ?? []).map((image) =>
      image.src === source ? { ...image, src: target } : image,
    ),
  }
}
export function markdownImage(name, src) {
  return `![${name.replace(/[[\]\\]/g, '')}](${src.includes(' ') ? '<' + src + '>' : src})`
}
