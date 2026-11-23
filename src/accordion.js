import { markdownTree } from './markdown-model.js'

const START = '<!-- sloth:accordion -->'
const END = '<!-- /sloth:accordion -->'

export function accordionBlocks(text, tree = markdownTree(text)) {
  const open = []
  const blocks = []
  for (const [index, node] of tree.children.entries()) {
    if (node.type !== 'html') continue
    if (node.value === START) {
      const title = tree.children[index + 1]
      const start = title?.position?.start
      const end = title?.position?.end
      const valid =
        title?.type === 'paragraph' &&
        start.line === node.position.end.line + 1 &&
        start.line === end.line
      open.push(valid ? { node, title } : null)
    } else if (node.value === END) {
      const start = open.pop()
      if (!start) continue
      blocks.push({
        from: start.node.position.start.offset,
        to: node.position.end.offset,
        line: start.node.position.start.line,
        titleEnd: start.title.position.end.line,
        level: 1,
        end: node.position.end.line,
      })
    }
  }
  return blocks
}

export function accordionTemplate(title, content = '') {
  return `${START}\n${title}\n\n${content ? `${content}\n\n` : ''}${END}`
}

export function remarkAccordions() {
  return (tree, file) => {
    const blocks = new Map(accordionBlocks(String(file)).map((block) => [block.from, block]))
    function transform(children) {
      const result = []
      for (let index = 0; index < children.length; index++) {
        const node = children[index]
        const block = blocks.get(node.position?.start.offset)
        if (block) {
          const endAt = children.findIndex(
            (child, at) => at > index && child.position?.end.offset === block.to,
          )
          if (endAt > index + 1) {
            const title = children[index + 1]
            result.push({
              type: 'accordion',
              data: {
                hName: 'details',
                hProperties: { open: true, className: 'markdown-accordion' },
              },
              position: { start: node.position.start, end: children[endAt].position.end },
              children: [
                { ...title, data: { hName: 'summary' } },
                ...transform(children.slice(index + 2, endAt)),
              ],
            })
            index = endAt
            continue
          }
        }
        if (node.children) node.children = transform(node.children)
        result.push(node)
      }
      return result
    }
    tree.children = transform(tree.children)
  }
}
