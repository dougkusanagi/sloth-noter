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
      const cells = block.columns.map((column) => {
        const children = content.filter(
          (node) =>
            node.position?.start.offset >= column.from && node.position?.end.offset <= column.to,
        )
        return {
          type: 'column',
          data: { hName: 'div', hProperties: { className: ['markdown-column'] } },
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
