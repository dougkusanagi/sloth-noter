import { Facet } from '@codemirror/state'

/**
 * An editor that holds a piece of the note, not the whole note (a column): it has no title,
 * no properties and no subtitle line, so every line is body text.
 */
export const embeddedDocument = Facet.define({ combine: (values) => values.some(Boolean) })

/**
 * The column each column editor shows: view → { context, index }. The context is the columns
 * widget's (its `parent` view and current `block`), so offsets in the note are
 * `context.block.columns[index].from + position`.
 */
export const columnHosts = new WeakMap()

/** The note's editor and the offset of this editor's text in it (0 for the note's own editor). */
export function hostOf(view) {
  const host = columnHosts.get(view)
  const column = host?.context.block.columns[host.index]
  if (!host || !column) return { parent: view, offset: 0, host: null }
  return { parent: host.context.parent, offset: column.from, host }
}
