import { markdownTree } from './markdown-model.js'

const opening = /^<details>\r?\n<summary>([^\n]*)<\/summary>$/

/** Find complete, top-level details blocks; leave malformed and nested HTML untouched. */
export function accordionBlocks(text) {
  const nodes = markdownTree(text).children
  const blocks = []
  for (let index = 0; index < nodes.length; index++) {
    const start = nodes[index]
    const match = start.type === 'html' && start.value.match(opening)
    if (!match) continue
    let endIndex = index + 1
    while (endIndex < nodes.length) {
      const node = nodes[endIndex]
      if (node.type === 'html' && (node.value === '</details>' || opening.test(node.value))) break
      endIndex++
    }
    const end = nodes[endIndex]
    if (!end || end.type !== 'html' || end.value !== '</details>') continue
    const titleFrom = start.position.start.offset + start.value.indexOf('<summary>') + 9
    blocks.push({
      from: start.position.start.offset,
      titleFrom,
      titleTo: titleFrom + match[1].length,
      bodyFrom: start.position.end.offset,
      closeFrom: end.position.start.offset,
      to: end.position.end.offset,
      title: match[1],
      firstNode: index,
      lastNode: endIndex,
    })
    index = endIndex
  }
  return blocks
}

/** Convert the recognized Markdown/HTML form into accessible HTML on mobile. */
export function remarkAccordions() {
  return (tree, file) => {
    const blocks = accordionBlocks(String(file))
    const byStart = new Map(blocks.map((block) => [block.from, block]))
    function visit(parent) {
      if (!parent.children) return
      const children = []
      for (let index = 0; index < parent.children.length; index++) {
        const node = parent.children[index]
        const block = byStart.get(node.position?.start.offset)
        if (!block) {
          visit(node)
          children.push(node)
          continue
        }
        let last = index + 1
        while (
          last < parent.children.length &&
          parent.children[last].position?.end.offset !== block.to
        )
          last++
        if (last >= parent.children.length) {
          children.push(node)
          continue
        }
        const contents = parent.children.slice(index + 1, last)
        const end = parent.children[last]
        children.push({
          type: 'accordion',
          data: { hName: 'details', hProperties: { open: true } },
          position: { start: node.position.start, end: end.position.end },
          children: [
            {
              type: 'accordionTitle',
              data: { hName: 'summary' },
              position: {
                start: { line: node.position.end.line, column: 1, offset: block.titleFrom - 9 },
                end: node.position.end,
              },
              children: [{ type: 'text', value: block.title }],
            },
            ...contents,
          ],
        })
        index = last
      }
      parent.children = children
    }
    visit(tree)
  }
}
