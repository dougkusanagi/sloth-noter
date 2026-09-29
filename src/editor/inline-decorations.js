import { Decoration } from '@codemirror/view'
import { inlineSyntax } from '../live-markdown.js'
import { safeHref } from '../markdown.jsx'

export function addInlineRangeDecorations(ranges, line, from, to, editing) {
  for (const token of inlineSyntax(line.text.slice(from, to))) {
    const start = line.from + from + token.start,
      end = line.from + from + token.end
    const contentStart = line.from + from + token.contentStart,
      contentEnd = line.from + from + token.contentEnd
    if (!editing) {
      if (start < contentStart) ranges.push(Decoration.replace({}).range(start, contentStart))
      if (contentEnd < end) ranges.push(Decoration.replace({}).range(contentEnd, end))
    }
    if (token.kind === 'link') {
      const href = safeHref(line.text.slice(from + token.contentEnd + 2, from + token.end - 1))
      ranges.push(
        Decoration.mark({
          class: 'cm-md-inline-link',
          attributes: { title: 'Ctrl + clique · Abrir link ↗', 'data-href': href ?? '' },
        }).range(contentStart, contentEnd),
      )
    } else
      ranges.push(
        Decoration.mark({ class: `cm-md-inline-${token.kind}` }).range(contentStart, contentEnd),
      )
  }
}

export function addInlineDecorations(ranges, line, shape, editing) {
  addInlineRangeDecorations(ranges, line, shape.prefix, line.text.length, editing)
}
