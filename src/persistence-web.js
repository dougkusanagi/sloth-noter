import { LEGACY_KEY, STORAGE_KEY, V2_KEY } from './storage.js'

export function browserStorage(target = window) {
  try {
    return target.localStorage
  } catch {
    return null
  }
}

function required(storage) {
  if (!storage) throw new Error('Storage is unavailable')
  return storage
}

export function createWebAdapter(storage) {
  return {
    kind: 'web',
    label: 'this browser',
    async readState() {
      return required(storage).getItem(STORAGE_KEY)
    },
    async readLegacy() {
      const store = required(storage)
      const version2 = store.getItem(V2_KEY)
      if (version2 !== null) return { source: 'v2', raw: version2 }
      const version1 = store.getItem(LEGACY_KEY)
      return version1 === null ? null : { source: 'v1', raw: version1 }
    },
    async writeState(contents) {
      required(storage).setItem(STORAGE_KEY, contents)
    },
  }
}
