const escapePattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = /[\p{L}\p{N}\p{M}_]/u

// Keep an offset map: removing accents must never move a source selection.
function foldedText(source) {
  let text = ''
  const starts = [],
    ends = []
  let offset = 0
  for (const char of source) {
    const normalized = char.normalize('NFD').replace(/\p{M}/gu, '')
    for (let index = 0; index < normalized.length; index++) {
      starts.push(offset)
      ends.push(offset + char.length)
    }
    if (!normalized && ends.length) ends[ends.length - 1] = offset + char.length
    text += normalized
    offset += char.length
  }
  return { text, starts, ends }
}
export function searchNote(source, query, options = {}) {
  if (
    !query ||
    (options.selectionOnly && (!options.scope || options.scope.to <= options.scope.from))
  )
    return { matches: [], error: null }
  const { caseSensitive = false, wholeWord = false, regex = false } = options
  const folded = regex ? null : foldedText(source)
  let pattern
  try {
    pattern = new RegExp(
      regex ? query : escapePattern(foldedText(query).text),
      caseSensitive ? 'gu' : 'giu',
    )
  } catch {
    return { matches: [], error: 'regex' }
  }
  if (options.selectionOnly) {
    const start = folded
      ? folded.starts.findIndex((offset) => offset >= options.scope.from)
      : options.scope.from
    if (start < 0) return { matches: [], error: null }
    pattern.lastIndex = start
  }
  const matches = []
  for (const match of (folded?.text ?? source).matchAll(pattern)) {
    const start = folded ? (folded.starts[match.index] ?? source.length) : match.index
    const end = folded
      ? match[0].length
        ? folded.ends[match.index + match[0].length - 1]
        : start
      : start + match[0].length
    if (
      wholeWord &&
      (word.test([...source.slice(0, start)].at(-1) ?? '') ||
        word.test(source.slice(end).match(/^./u)?.[0] ?? ''))
    )
      continue
    if (
      options.selectionOnly &&
      options.scope &&
      (start < options.scope.from || end > options.scope.to)
    )
      continue
    matches.push({ start, end, ...(regex ? { captures: [...match], groups: match.groups } : {}) })
  }
  return { matches, error: null }
}
export function findMatches(source, query, options) {
  return searchNote(source, query, options).matches
}
export function replacementText(source, match, replacement, options = {}) {
  if (options.regex)
    replacement = replacement.replace(
      /\\([nt\\])/g,
      (_, char) => ({ n: '\n', t: '\t', '\\': '\\' })[char],
    )
  let result = options.regex
    ? replacement.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g, (token, key) => {
        if (key === '$') return '$'
        if (key === '&' || key === '0') return source.slice(match.start, match.end)
        if (key === '`') return source.slice(0, match.start)
        if (key === "'") return source.slice(match.end)
        if (key.startsWith('<'))
          return match.groups ? (match.groups[key.slice(1, -1)] ?? '') : token
        const index = Number(key)
        if (index > 0 && index < match.captures.length) return match.captures[index] ?? ''
        const first = Number(key[0])
        return key.length === 2 && first > 0 && first < match.captures.length
          ? (match.captures[first] ?? '') + key[1]
          : token
      })
    : replacement
  if (options.preserveCase) {
    const original = source.slice(match.start, match.end)
    if (original.toUpperCase() === original && original.toLowerCase() !== original)
      result = result.toUpperCase()
    else if (original.toLowerCase() === original) result = result.toLowerCase()
    else if (original[0]?.toUpperCase() === original[0])
      result = result.charAt(0).toUpperCase() + result.slice(1).toLowerCase()
  }
  return result
}
