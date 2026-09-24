export function findMatches(source, query) {
  if (!query) return []
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(escaped, 'gi')
  return [...source.matchAll(pattern)].map(match => ({ start: match.index, end: match.index + match[0].length }))
}
