import { markdownTree, walk } from './markdown-model.js'

/** Only standalone details/summary tags are interpreted; arbitrary HTML stays disabled. */
export function detailsBlocks(text) {
  const tokens = []
  walk(markdownTree(text), (node) => {
    if (node.type !== 'html') return
    let offset = node.position.start.offset
    let line = node.position.start.line
    for (const value of node.value.split('\n')) {
      const tag = value.trim()
      if (tag === '<details>' || tag === '</details>' || /^<summary>[^<>]*<\/summary>$/.test(tag))
        tokens.push({ tag, from: offset, to: offset + value.length, line })
      offset += value.length + 1
      line++
    }
  })
  const stack = [],
    blocks = []
  for (const token of tokens) {
    if (token.tag === '<details>') stack.push(token)
    else if (token.tag.startsWith('<summary>')) {
      const parent = stack.at(-1)
      if (parent && !parent.summary) parent.summary = token
    } else {
      const start = stack.pop()
      if (!start?.summary) continue
      blocks.push({
        from: start.from,
        to: token.to,
        line: start.line,
        titleEnd: start.summary.line,
        end: token.line,
        level: 1,
        summary: start.summary.tag.slice(9, -10),
        contentFrom: start.summary.to + 1,
        contentTo: token.from,
      })
    }
  }
  return blocks.sort((a, b) => a.from - b.from)
}

export function remarkDetails() {
  return (tree, file) => {
    const blocks = new Map(detailsBlocks(String(file)).map((block) => [block.from, block]))
    const transform = (parent) => {
      if (!parent.children) return
      const result = []
      for (let index = 0; index < parent.children.length; index++) {
        const node = parent.children[index]
        const block = blocks.get(node.position?.start.offset)
        if (block) {
          let last = index
          while (
            last < parent.children.length &&
            parent.children[last].position?.end.offset < block.to
          )
            last++
          if (parent.children[last]?.position?.end.offset === block.to) {
            const container = {
              type: 'detailsBlock',
              data: { hName: 'details', hProperties: { open: true } },
              position: { start: node.position.start, end: parent.children[last].position.end },
              children: [
                {
                  type: 'detailsSummary',
                  data: { hName: 'summary' },
                  children: [{ type: 'text', value: block.summary }],
                },
                ...parent.children.slice(index + 1, last),
              ],
            }
            transform(container)
            result.push(container)
            index = last
            continue
          }
        }
        transform(node)
        result.push(node)
      }
      parent.children = result
    }
    transform(tree)
  }
}
