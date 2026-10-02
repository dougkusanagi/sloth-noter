import { Decoration } from '@codemirror/view'
import { inlineSyntax } from '../live-markdown.js'
import { safeHref } from '../markdown.jsx'
import { t } from '../i18n.js'

export function addInlineRangeDecorations(ranges, line, from, to, editing) {
  for (const token of inlineSyntax(line.text.slice(from, to), line.definitions ?? '')) {
    const start = line.from + from + token.start,
      end = line.from + from + token.end
    const contentStart = line.from + from + token.contentStart,
      contentEnd = line.from + from + token.contentEnd
    if (!editing) {
      if (start < contentStart) ranges.push(Decoration.replace({}).range(start, contentStart))
      if (contentEnd < end) ranges.push(Decoration.replace({}).range(contentEnd, end))
    }
    if (contentEnd <= contentStart) continue
    if (token.kind === 'wiki') {
      ranges.push(
        Decoration.mark({
          class: 'cm-md-inline-link cm-md-wiki',
          attributes: { 'data-wiki': token.target, title: t('wiki.open', { name: token.label }) },
        }).range(contentStart, contentEnd),
      )
    } else if (token.kind === 'link') {
      const href = safeHref(token.href ?? '')
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
