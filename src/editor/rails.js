import { RectangleMarker, layer } from '@codemirror/view'
import { markdownTree } from '../markdown-model.js'

/** Continuous guides include wrapped lines below the parent marker. */
export const railsLayer = layer({
  above: false,
  class: 'cm-rails',
  update: () => true,
  markers(view) {
    const { doc } = view.state
    const text = doc.toString()
    const tree = markdownTree(text)
    const base = view.scrollDOM.getBoundingClientRect()
    const left =
      view.contentDOM.getBoundingClientRect().left - base.left + view.scrollDOM.scrollLeft
    const top = view.documentTop - base.top + view.scrollDOM.scrollTop
    const size = parseFloat(getComputedStyle(view.contentDOM).fontSize) || 16
    const markers = []
    const rail = (x, from, to, parentLine) => {
      const start = view.lineBlockAt(doc.line(from).from)
      const end = view.lineBlockAt(doc.line(to).to)
      const parent = view.lineBlockAt(doc.line(parentLine).from)
      const railTop = Math.min(start.top, parent.top + view.defaultLineHeight)
      markers.push(new RectangleMarker('cm-rail', x, top + railTop, null, end.bottom - railTop))
    }
    const visit = (node, depth) => {
      if (node.type === 'listItem') {
        const nested = node.children.filter((child) => child.type === 'list')
        if (nested.length)
          rail(
            left + (depth * 1.5 + 0.57) * size,
            nested[0].position.start.line,
            nested.at(-1).position.end.line,
            node.position.start.line,
          )
      }
      for (const child of node.children ?? [])
        visit(child, node.type === 'listItem' ? depth + 1 : depth)
    }
    visit(tree, 0)
    return markers
  },
})
