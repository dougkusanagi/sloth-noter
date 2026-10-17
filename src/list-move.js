import { markdownTree, walk } from './markdown-model.js'

/** Move selected sibling items as complete Markdown blocks, including their children. */
export function moveListItems(text, anchor, head, direction) {
  const from = Math.min(anchor, head)
  let to = Math.max(anchor, head)
  if (to > from && text[to - 1] === '\n') to--
  const lineStart = (at) => text.lastIndexOf('\n', at - 1) + 1
  let match = null
  walk(markdownTree(text), (node) => {
    if (node.type !== 'list') return
    const first = node.children.findIndex(
      (item) => from >= lineStart(item.position.start.offset) && from <= item.position.end.offset,
    )
    const last = node.children.findIndex(
      (item) => to >= lineStart(item.position.start.offset) && to <= item.position.end.offset,
    )
    // Walking children last picks the deepest list that contains the whole selection.
    if (first >= 0 && last >= first) match = { items: node.children, first, last }
  })
  if (!match) return null
  const { items, first, last } = match
  const neighbor = items[direction < 0 ? first - 1 : last + 1]
  if (!neighbor) return { changes: [], anchor, head }
  const start = lineStart(items[first].position.start.offset)
  const end = items[last].position.end.offset
  const otherStart = lineStart(neighbor.position.start.offset)
  const otherEnd = neighbor.position.end.offset
  const selected = text.slice(start, end)
  const other = text.slice(otherStart, otherEnd)
  const gap = direction < 0 ? text.slice(otherEnd, start) : text.slice(end, otherStart)
  const shift = direction < 0 ? otherStart - start : other.length + gap.length
  return {
    changes: [
      {
        from: Math.min(start, otherStart),
        to: Math.max(end, otherEnd),
        insert: direction < 0 ? selected + gap + other : other + gap + selected,
      },
    ],
    anchor: Math.min(anchor, end) + shift,
    head: Math.min(head, end) + shift,
  }
}
