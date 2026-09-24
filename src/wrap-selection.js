const pairs = {
  '(': ')', '[': ']', '{': '}',
  '"': '"', "'": "'", '`': '`',
}

export function wrappingPair(key) {
  return Object.hasOwn(pairs, key) ? [key, pairs[key]] : null
}

export function wrapSelection(text, from, to, key) {
  const pair = wrappingPair(key)
  if (!pair || from === to) return null
  const selected = text.slice(from, to)
  return {
    insert: `${pair[0]}${selected}${pair[1]}`,
    from: from + pair[0].length,
    to: to + pair[0].length,
  }
}
