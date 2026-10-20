const normalized = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

/** Open tabs keep their visible order; other notes remain searchable below them. */
export function quickOpenNotes(notes, openIds, query = '') {
  const byId = new Map(notes.map((note) => [note.id, note]))
  const open = new Set(openIds)
  const search = normalized(query.trim())
  const matches = (note) => normalized(note.name).includes(search)
  return [
    ...openIds.flatMap((id, index) => {
      const note = byId.get(id)
      return note && matches(note)
        ? [{ ...note, isOpen: true, tabNumber: index < 9 ? index + 1 : null }]
        : []
    }),
    ...notes
      .filter((note) => !open.has(note.id) && matches(note))
      .map((note) => ({ ...note, isOpen: false })),
  ]
}
