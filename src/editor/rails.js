import { RectangleMarker, layer } from '@codemirror/view'
import { markdownTree } from '../markdown-model.js'
import { foldField } from './folding.js'

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
    // Folded sections collapse into their heading's block, so rails computed
    // inside them land on the heading as a stray line. Track the folds and
    // skip any rail a fold covers (or whose parent line is folded).
    const folds = []
    view.state.field(foldField, false)?.between(0, doc.length, (from, to) => folds.push([from, to]))
    // The height map can lag behind lines whose styles changed without a resize
    // (e.g. a fresh read-only view); prefer the rendered line when it exists.
    const block = (pos) => {
      const line = view.domAtPos(pos).node
      const element = (line.nodeType === 1 ? line : line.parentElement)?.closest?.('.cm-line')
      if (!element) return view.lineBlockAt(pos)
      const rect = element.getBoundingClientRect()
      return { top: rect.top - view.documentTop, bottom: rect.bottom - view.documentTop }
    }
    const foldedParent = (pos) => folds.some(([f, t]) => f < pos && pos < t)
    const coveredSpan = (from, to) => folds.some(([f, t]) => f < to && t > from)
    const rail = (x, from, to, parentLine) => {
      const nestedFrom = doc.line(from).from
      const nestedTo = doc.line(to).to
      if (foldedParent(doc.line(parentLine).from) || coveredSpan(nestedFrom, nestedTo)) return
      const start = block(nestedFrom)
      const end = block(doc.line(to).to)
      const parent = block(doc.line(parentLine).from)
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
