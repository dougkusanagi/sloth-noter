import { markdownTree } from './markdown-model.js'

const START = '<!-- sloth:columns -->'
const COLUMN = '<!-- sloth:column -->'
const END = '<!-- /sloth:columns -->'

/** A recognized block has standalone markers and blank lines around each column. */
export function columnBlocks(text) {
  const nodes = markdownTree(text).children
  const blocks = []
  for (let index = 0; index < nodes.length; index++) {
    const start = nodes[index]
    if (start.type !== 'html' || start.value !== START) continue
    const markers = []
    let endIndex = index + 1
    for (; endIndex < nodes.length; endIndex++) {
      const node = nodes[endIndex]
      if (node.type !== 'html') continue
      if (node.value === START || node.value === END) break
      if (node.value === COLUMN) markers.push(node)
    }
    const end = nodes[endIndex]
    if (!end || end.value !== END || markers.length < 2) continue
    if (!/^\s*$/.test(text.slice(start.position.end.offset, markers[0].position.start.offset)))
      continue
    const columns = []
    for (let number = 0; number < markers.length; number++) {
      const marker = markers[number]
      const next = markers[number + 1] ?? end
      const prefix = text.slice(marker.position.end.offset).match(/^(?:\r?\n){2}/)?.[0]
      const suffix = text.slice(0, next.position.start.offset).match(/(?:\r?\n){2}$/)?.[0]
      if (!prefix || !suffix) break
      const from = marker.position.end.offset + prefix.length
      const to = next.position.start.offset - suffix.length
      if (from > to) break
      columns.push({ from, to, text: text.slice(from, to) })
    }
    if (columns.length !== markers.length) continue
    blocks.push({ from: start.position.start.offset, to: end.position.end.offset, columns })
    index = endIndex
  }
  return blocks
}

/** On readers with HTML disabled, render the content between markers as Markdown. */
export function remarkColumns() {
  return (tree, file) => {
    const blocks = new Map(columnBlocks(String(file)).map((block) => [block.from, block]))
    const result = []
    for (let index = 0; index < tree.children.length; index++) {
      const start = tree.children[index]
      const block = blocks.get(start.position?.start.offset)
      if (!block) {
        result.push(start)
        continue
      }
      let last = index + 1
      while (last < tree.children.length && tree.children[last].position?.end.offset !== block.to)
        last++
      if (last >= tree.children.length) {
        result.push(start)
        continue
      }
      const content = tree.children.slice(index + 1, last)
      const cells = block.columns.map((column, columnIndex) => {
        const children = content.filter(
          (node) =>
            node.position?.start.offset >= column.from && node.position?.end.offset <= column.to,
        )
        return {
          type: 'column',
          data: {
            hName: 'div',
            hProperties: {
              className: ['markdown-column'],
              'data-column-index': String(columnIndex + 1),
              'data-column-count': String(block.columns.length),
            },
          },
          position: children.length
            ? { start: children[0].position.start, end: children.at(-1).position.end }
            : start.position,
          children,
        }
      })
      result.push({
        type: 'columns',
        data: { hName: 'div', hProperties: { className: ['markdown-columns'] } },
        position: { start: start.position.start, end: tree.children[last].position.end },
        children: cells,
      })
      index = last
    }
    tree.children = result
  }
}

export function columnsTemplate(values) {
  return `${START}\n\n${values.map((value) => `${COLUMN}\n\n${value}`).join('\n\n')}\n\n${END}`
}

export function columnBlockAt(text, pos) {
  for (const block of columnBlocks(text)) {
    if (pos >= block.from && pos <= block.to) {
      const colIndex = block.columns.findIndex((col) => pos >= col.from && pos <= col.to)
      return { block, colIndex: colIndex >= 0 ? colIndex : 0 }
    }
  }
  return null
}

export function addColumnEdit(text, pos) {
  const found = columnBlockAt(text, pos)
  if (!found) return null
  const values = found.block.columns.map((col) => col.text)
  values.splice(found.colIndex + 1, 0, '')
  const insert = columnsTemplate(values)
  return {
    from: found.block.from,
    to: found.block.to,
    insert,
    selectionFrom: found.block.from + insert.length - END.length - 2,
    selectionTo: found.block.from + insert.length - END.length - 2,
  }
}

export function removeColumnEdit(text, pos) {
  const found = columnBlockAt(text, pos)
  if (!found) return null
  const values = found.block.columns.map((col) => col.text)
  const removed = values.splice(found.colIndex, 1)[0]
  if (removed.trim()) {
    const target = Math.max(0, found.colIndex - 1)
    values[target] = values[target].trim() ? `${values[target]}\n\n${removed}` : removed
  }
  const insert = values.length < 2 ? values.join('\n\n') : columnsTemplate(values)
  return {
    from: found.block.from,
    to: found.block.to,
    insert,
    selectionFrom: found.block.from,
    selectionTo: found.block.from,
  }
}

export function moveSelectionToColumnEdit(text, from, to, targetColIndex) {
  const found = columnBlockAt(text, from)
  if (!found) return null
  if (targetColIndex < 0 || targetColIndex >= found.block.columns.length) return null
  if (targetColIndex === found.colIndex) return null
  const col = found.block.columns[found.colIndex]
  let sliceFrom = from
  let sliceTo = to
  if (sliceFrom === sliceTo) {
    const lineStart = text.lastIndexOf('\n', from - 1) + 1
    const lineEnd = text.indexOf('\n', from)
    sliceFrom = Math.max(col.from, lineStart)
    sliceTo = Math.min(col.to, lineEnd < 0 ? col.to : lineEnd)
  } else {
    sliceFrom = Math.max(col.from, sliceFrom)
    sliceTo = Math.min(col.to, sliceTo)
  }
  const moved = text.slice(sliceFrom, sliceTo).trim()
  if (!moved) return null
  const values = found.block.columns.map((c) => c.text)
  const before = text.slice(col.from, sliceFrom)
  const after = text.slice(sliceTo, col.to)
  values[found.colIndex] = `${before}${after}`.replace(/\n{3,}/g, '\n\n').trim()
  values[targetColIndex] = values[targetColIndex].trim()
    ? `${values[targetColIndex].trim()}\n\n${moved}`
    : moved
  const insert = columnsTemplate(values)
  return {
    from: found.block.from,
    to: found.block.to,
    insert,
    selectionFrom: found.block.from,
    selectionTo: found.block.from,
  }
}
