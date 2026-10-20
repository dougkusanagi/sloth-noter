/** LRU bounded by entry count and source length. One oversized current text may stay cached. */
export function createTextCache({ maxEntries = 8, maxCharacters = 1_000_000 } = {}) {
  const entries = new Map()
  let characters = 0
  return {
    get(key) {
      if (!entries.has(key)) return undefined
      const value = entries.get(key)
      entries.delete(key)
      entries.set(key, value)
      return value
    },
    set(key, value) {
      if (entries.has(key)) characters -= key.length
      entries.delete(key)
      entries.set(key, value)
      characters += key.length
      while (entries.size > 1 && (entries.size > maxEntries || characters > maxCharacters)) {
        const oldest = entries.keys().next().value
        characters -= oldest.length
        entries.delete(oldest)
      }
    },
    get size() {
      return entries.size
    },
    get characters() {
      return characters
    },
  }
}
