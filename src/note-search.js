import { searchNote } from './find.js'
import { taskDateQuery } from './task-dates.js'

const normalizeSearchText = (text) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

const titleStem = (name) => name.replace(/\.md$/i, '')

const stripLeadingDecor = (text) => text.replace(/^[^\p{L}\p{N}]+/u, '').trim()

/**
 * Ranks how strongly a note title matches `query`:
 * 4 = exact title (full or after leading emoji/punctuation)
 * 3 = title starts with query (full or after leading emoji/punctuation)
 * 2 = a word in the title starts with query
 * 1 = query appears elsewhere in the title
 * 0 = no title match
 */
export function titleMatchRank(name, query) {
  const needle = normalizeSearchText(query.trim())
  if (!needle) return 0
  const raw = normalizeSearchText(titleStem(name).trim())
  const clean = stripLeadingDecor(raw)
  if (raw === needle || (clean && clean === needle)) return 4
  if (raw.startsWith(needle) || (clean && clean.startsWith(needle))) return 3
  let pos = raw.indexOf(needle)
  if (pos < 0) return 0
  while (pos >= 0) {
    if (pos === 0 || !/[\p{L}\p{N}]/u.test(raw[pos - 1])) return 2
    pos = raw.indexOf(needle, pos + 1)
  }
  return 1
}

/**
 * Compares two `{ note, result }` search hits by relevance:
 * stronger title match > earlier title position > shorter title >
 * more body occurrences > earlier body occurrence.
 * Returns 0 on ties so callers can apply their own fallback sort.
 */
export function compareNoteSearch(a, b, query) {
  const needle = query.trim()
  if (!needle) return 0
  const rankDiff = titleMatchRank(b.note.name, needle) - titleMatchRank(a.note.name, needle)
  if (rankDiff) return rankDiff
  const rank = titleMatchRank(a.note.name, needle)
  if (rank > 0) {
    const aPos = a.result?.titleMatches?.[0]?.start ?? Infinity
    const bPos = b.result?.titleMatches?.[0]?.start ?? Infinity
    if (aPos !== bPos) return aPos - bPos
    const lenDiff = titleStem(a.note.name).length - titleStem(b.note.name).length
    if (lenDiff) return lenDiff
  }
  const aCount = a.result?.matches?.length ?? 0
  const bCount = b.result?.matches?.length ?? 0
  if (aCount !== bCount) return bCount - aCount
  const aFirst = a.result?.matches?.[0]?.start ?? Infinity
  const bFirst = b.result?.matches?.[0]?.start ?? Infinity
  if (aFirst !== bFirst) return aFirst - bFirst
  return 0
}

export function noteSearchResult(note, query) {
  const needle = query.trim()
  if (!needle) return { matches: [], titleMatches: [], snippet: null }
  const date = taskDateQuery(needle)
  const matches = date
    ? searchNote(note.body, date, { regex: true }).matches
    : searchNote(note.body, needle).matches
  const titleMatches = searchNote(titleStem(note.name), needle).matches
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
