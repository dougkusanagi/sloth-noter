import { ensureDocumentTitles } from './title.js'
import { reconcileHeadingNames } from './notes.js'

/**
 * Reads the saved document and reconciles headings with filenames before the
 * editor appears. A blocked storage is returned untouched, exactly like the
 * previous synchronous start-up did.
 */
export async function openWorkspace(persistence) {
  const loaded = await persistence.load()
  if (loaded.blocked) return loaded
  const normalized = ensureDocumentTitles(loaded.document)
  const document = reconcileHeadingNames(normalized)
  if (document === loaded.document) return loaded
  return { ...loaded, document, error: await persistence.save(document) }
}
