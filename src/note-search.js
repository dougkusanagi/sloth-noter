import { searchNote } from './find.js'

export function noteSearchResult(note, query) {
  const needle = query.trim()
  if (!needle) return { matches: [], titleMatches: [], snippet: null }
  const matches = searchNote(note.body, needle).matches
  const titleMatches = searchNote(note.name, needle).matches
  const first = matches[0]
  const start = first
    ? Math.max(note.body.lastIndexOf('\n', first.start - 1) + 1, first.start - 45)
    : 0
  const end = first
    ? Math.min(
        note.body.indexOf('\n', first.end) < 0
          ? note.body.length
          : note.body.indexOf('\n', first.end),
        first.end + 90,
      )
    : 0
  return {
    matches,
    titleMatches,
    snippet: first
      ? {
          before: (start ? '…' : '') + note.body.slice(start, first.start),
          hit: note.body.slice(first.start, first.end),
          after: note.body.slice(first.end, end) + (end < note.body.length ? '…' : ''),
        }
      : null,
  }
}

export function matchesNote(note, query) {
  if (!query.trim()) return true
  const result = noteSearchResult(note, query)
  return Boolean(result.matches.length || result.titleMatches.length)
}
