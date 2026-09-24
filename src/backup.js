import { validateDocument } from './storage.js'

export function createBackup(document) {
  validateDocument(document)
  return JSON.stringify(document, null, 2)
}

export function readBackup(text) {
  return validateDocument(JSON.parse(text))
}
