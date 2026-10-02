import { friendlyError } from './errors.js'
import { newDocument, readStoredDocument, serializeDocument } from './storage.js'

function message(error) {
  return friendlyError(error)
}

/**
 * Turns a storage adapter into the asynchronous contract used by the interface.
 *
 * The web adapter answers from the browser storage and the desktop adapter
 * answers from the native state file, which are both the same versioned
 * document. Validation, migration and failure semantics live here, so both
 * implementations cannot drift apart.
 */
export function createPersistence(adapter, label = adapter.label) {
  const persistence = {
    kind: adapter.kind,
    label,
    sync: adapter.sync ?? null,
    async load() {
      let current = null
      let legacy = null
      try {
        current = await adapter.readState()
        if (current === null || current === undefined) legacy = await adapter.readLegacy()
      } catch (error) {
        return { document: newDocument(), error: message(error), blocked: true, raw: null }
      }
      const read = readStoredDocument({ current, legacy })
      if (!read.needsWrite)
        return { document: read.document, error: read.error, blocked: read.blocked, raw: read.raw }
      return {
        document: read.document,
        error: await persistence.save(read.document),
        blocked: false,
        raw: null,
      }
    },
    async save(document) {
      let text
      try {
        text = serializeDocument(document)
      } catch (error) {
        return message(error)
      }
      try {
        await adapter.writeState(text)
        return null
      } catch (error) {
        return message(error)
      }
    },
  }
  return persistence
}
