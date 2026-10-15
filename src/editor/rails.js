import { RectangleMarker, layer } from '@codemirror/view'
import { markdownTree } from '../markdown-model.js'
import { headingSections } from '../sections.js'

/** Distance between the rails of nested sections, and from the first one to the text. */
const RAIL_GAP = 5
const RAIL_EDGE = 8
const MAX_RAILS = 4

/** Dotted rails (as in the reading view) that show how sections and lists nest. */
export const railsLayer = layer({
  above: false,
  class: 'cm-rails',
  update: (update) =>
    update.docChanged || update.viewportChanged || update.geometryChanged || update.heightChanged,
  markers(view) {
    const { doc } = view.state
    const text = doc.toString()
    const tree = markdownTree(text)
    const lines = text.split('\n')
    const base = view.scrollDOM.getBoundingClientRect()
    const left =
      view.contentDOM.getBoundingClientRect().left - base.left + view.scrollDOM.scrollLeft
    const top = view.documentTop - base.top + view.scrollDOM.scrollTop
    const size = parseFloat(getComputedStyle(view.contentDOM).fontSize) || 16
    const markers = []
    const rail = (x, from, to) => {
      const start = view.lineBlockAt(doc.line(from).from)
      const end = view.lineBlockAt(doc.line(to).to)
      markers.push(new RectangleMarker('cm-rail', x, top + start.top, null, end.bottom - start.top))
    }
    for (const heading of headingSections(text, tree)) {
      if (heading.level === 0) continue
      let last = Math.min(heading.end, lines.length)
      while (last > heading.titleEnd && !lines[last - 1].trim()) last--
      if (last === heading.titleEnd) continue
      rail(
        left - RAIL_EDGE - RAIL_GAP * (Math.min(heading.height, MAX_RAILS) - 1),
        heading.line,
        last,
      )
    }
    const visit = (node, depth) => {
      if (node.type === 'listItem') {
        const nested = node.children.filter((child) => child.type === 'list')
        if (nested.length)
          rail(
            left + (depth * 1.5 + 0.57) * size,
            nested[0].position.start.line,
            nested.at(-1).position.end.line,
          )
      }
      for (const child of node.children ?? [])
        visit(child, node.type === 'listItem' ? depth + 1 : depth)
    }
    visit(tree, 0)
    return markers
  },
})
