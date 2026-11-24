import { columnBlocks, columnsTemplate } from './columns.js'

// Edits on the note's whole text for the column layout: a block dropped beside another makes
// columns, a block moved out of a column leaves no empty column behind, and a layout with one
// column left turns back into ordinary blocks. Ranges are offsets in the note's text; a block
// range covers whole lines, without the final line break.

const COLUMN_HEAD = '<!-- sloth:column -->\n\n'

/** The columns block that holds the range, and the column's index in it. */
export function columnAt(text, from, to = from) {
  for (const block of columnBlocks(text)) {
    const index = block.columns.findIndex((column) => from >= column.from && to <= column.to)
    if (index >= 0) return { block, index }
  }
  return null
}

/** The edit that takes a block out of the text, with one of the blank lines around it. */
function removal(text, range) {
  const holder = columnAt(text, range.from, range.to)
  if (holder) {
    const { block, index } = holder
    const column = block.columns[index]
    // The block is all the column holds: the column goes with it.
    if (!text.slice(column.from, column.to).replace(text.slice(range.from, range.to), '').trim()) {
      if (block.columns.length <= 2) {
        // One column left: the layout turns back into its blocks.
        const other = block.columns[index === 0 ? 1 : 0]
        return { from: block.from, to: block.to, insert: other.text }
      }
      return { from: column.from - COLUMN_HEAD.length, to: column.to + 2, insert: '' }
    }
  }
  if (text.startsWith('\n\n', range.to)) return { from: range.from, to: range.to + 2, insert: '' }
  // An item with a sibling right below it (a list): only its own line goes.
  if (text[range.to] === '\n') return { from: range.from, to: range.to + 1, insert: '' }
  if (range.from >= 2 && text.slice(range.from - 2, range.from) === '\n\n')
    return { from: range.from - 2, to: range.to, insert: '' }
  return { from: Math.max(0, range.from - 1), to: range.to, insert: '' }
}

function apply(text, edits) {
  const sorted = [...edits].sort((a, b) => b.from - a.from)
  for (let index = 1; index < sorted.length; index++)
    if (sorted[index].to > sorted[index - 1].from) return null
  return sorted.reduce(
    (result, edit) => result.slice(0, edit.from) + edit.insert + result.slice(edit.to),
    text,
  )
}

const overlaps = (a, b) => a.from < b.to && b.from < a.to

/**
 * The text after dropping the block `source` beside `target` (`side`: left or right). A target
 * that is a columns block gets a new column (at `index`, or at that edge); any other block is
 * put side by side with the source in a new columns block. Returns null when nothing changes.
 */
export function dropBeside(text, source, target, side, index) {
  if (!text.slice(source.from, source.to).trim()) return null
  const sourceText = text.slice(source.from, source.to)
  const group = columnBlocks(text).find((block) => block.from === target.from)
  const holder = columnAt(text, source.from, source.to)
  // A block of the same layout becomes a column of its own there; its old column goes when empty.
  if (group && holder?.block.from === group.from) {
    const texts = group.columns.map((column) => column.text)
    const column = group.columns[holder.index]
    const local = { from: source.from - column.from, to: source.to - column.from }
    texts[holder.index] = apply(texts[holder.index], [removal(texts[holder.index], local)])
    let at = index ?? (side === 'left' ? 0 : texts.length)
    if (!texts[holder.index].trim()) {
      texts.splice(holder.index, 1)
      if (holder.index < at) at--
    }
    texts.splice(Math.max(0, Math.min(texts.length, at)), 0, sourceText)
    const insert = columnsTemplate(texts)
    return insert === text.slice(group.from, group.to)
      ? null
      : apply(text, [{ from: group.from, to: group.to, insert }])
  }
  if (overlaps(source, target)) return null
  let insert
  if (group) {
    const texts = group.columns.map((column) => column.text)
    const at = index ?? (side === 'left' ? 0 : texts.length)
    texts.splice(Math.max(0, Math.min(texts.length, at)), 0, sourceText)
    insert = columnsTemplate(texts)
  } else {
    const targetText = text.slice(target.from, target.to)
    insert = columnsTemplate(side === 'left' ? [sourceText, targetText] : [targetText, sourceText])
  }
  const remove = removal(text, source)
  if (overlaps(remove, target)) return null
  // The layout's markers stand on their own lines, apart from the blocks around them.
  const before = target.from > 0 && !text.slice(0, target.from).endsWith('\n\n') ? '\n\n' : ''
  const after = target.to < text.length && !text.startsWith('\n\n', target.to) ? '\n\n' : ''
  return apply(text, [
    remove,
    { from: target.from, to: target.to, insert: before + insert + after },
  ])
}

/**
 * The text after moving the block `source` to `at`, the start of a block line (or the end of the
 * text, or of a column), across columns and the rest of the note. Returns null when nothing changes.
 */
export function moveAcross(text, source, at) {
  if (at >= source.from && at <= source.to) return null
  const sourceText = text.slice(source.from, source.to)
  if (!sourceText.trim()) return null
  const remove = removal(text, source)
  if (at > remove.from && at < remove.to) return null
  // At the start of a line the block goes above it; at the end of the text or of a column, below.
  const lineStart = at === 0 || text[at - 1] === '\n'
  const column = columnAt(text, at)
  const end = at === text.length || (column && at === column.block.columns[column.index].to)
  const insert = end && !lineStart ? `\n\n${sourceText}` : `${sourceText}\n\n`
  return apply(text, [remove, { from: at, to: at, insert }])
}

/** The text after removing the column `index` of the block at `from`; one left ends the layout. */
export function removeColumn(text, from, index) {
  const block = columnBlocks(text).find((item) => item.from === from)
  const column = block?.columns[index]
  if (!column) return null
  if (block.columns.length <= 2) {
    const kept = block.columns
      .filter((_, number) => number !== index)
      .map((item) => item.text)
      .concat(column.text.trim() ? [column.text] : [])
      .filter((value) => value.trim())
    return apply(text, [{ from: block.from, to: block.to, insert: kept.join('\n\n') }])
  }
  return apply(text, [{ from: column.from - COLUMN_HEAD.length, to: column.to + 2, insert: '' }])
}

/** The text with an empty column added to the block at `from`, at `index` (default: the end). */
export function addColumn(text, from, index) {
  const block = columnBlocks(text).find((item) => item.from === from)
  if (!block) return null
  const texts = block.columns.map((column) => column.text)
  texts.splice(index ?? texts.length, 0, '')
  return apply(text, [{ from: block.from, to: block.to, insert: columnsTemplate(texts) }])
}

/** The text with the columns block at `from` turned back into its blocks, one after another. */
export function unwrapColumns(text, from) {
  const block = columnBlocks(text).find((item) => item.from === from)
  if (!block) return null
  const insert = block.columns
    .map((column) => column.text)
    .filter((value) => value.trim())
    .join('\n\n')
  return apply(text, [{ from: block.from, to: block.to, insert }])
}
