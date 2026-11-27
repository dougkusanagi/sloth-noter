import { titleMatchRank } from './note-search.js'

const normalized = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()
const titleStem = (name) => name.replace(/\.md$/i, '')

/** Open tabs keep their visible order; other notes remain searchable below them. */
export function quickOpenNotes(notes, openIds, query = '') {
  const byId = new Map(notes.map((note) => [note.id, note]))
  const open = new Set(openIds)
  const search = normalized(query.trim())
  const matches = (note) => !search || normalized(titleStem(note.name)).includes(search)
  const compareFiltered = (a, b) => {
    if (!search) return 0
    const rankDiff = titleMatchRank(b.name, search) - titleMatchRank(a.name, search)
    if (rankDiff) return rankDiff
    const aPos = normalized(titleStem(a.name)).indexOf(search)
    const bPos = normalized(titleStem(b.name)).indexOf(search)
    if (aPos !== bPos) return aPos - bPos
    return titleStem(a.name).length - titleStem(b.name).length
  }
  const openMatches = openIds
    .flatMap((id, index) => {
      const note = byId.get(id)
      return note && matches(note)
        ? [{ ...note, isOpen: true, tabNumber: index < 9 ? index + 1 : null }]
        : []
    })
    .sort(compareFiltered)
  const closedMatches = notes
    .filter((note) => !open.has(note.id) && matches(note))
    .map((note) => ({ ...note, isOpen: false }))
    .sort(compareFiltered)
  return [...openMatches, ...closedMatches]
}
