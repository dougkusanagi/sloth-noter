import { t } from './i18n.js'

export const calloutTypes = ['note', 'tip', 'important', 'warning', 'caution']

export const calloutActions = calloutTypes.map((type) => [
  `callout-${type}`,
  `callout.insert.${type}`,
])

export function calloutTemplate(type, body) {
  return [
    `> [!${type.toUpperCase()}]`,
    ...body.split('\n').map((line) => (line ? `> ${line}` : '>')),
  ].join('\n')
}

/** Recognize the first source line of a Markdown blockquote. */
export function readCallout(text, node) {
  if (node.type !== 'blockquote' || !node.position) return null
  const { start, end } = node.position
  const lineStart = start.offset - start.column + 1
  if (text.slice(lineStart, start.offset).trim()) return null
  const lineEnd = text.indexOf('\n', start.offset)
  const source = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd).trimEnd()
  const match = /^(\s*>[\t ]?\[!([A-Z]+)\])(?:([\t ]+)(.*))?$/i.exec(source)
  const type = match?.[2].toLowerCase()
  if (!calloutTypes.includes(type)) return null
  return {
    type,
    first: start.line,
    last: end.line,
    title: match[4] || '',
    prefix: match[1].length + (match[3]?.length ?? 0),
  }
}

export function remarkCallouts() {
  return (tree, file) => {
    const text = String(file)
    function visit(node) {
      const callout = readCallout(text, node)
      if (callout && node.children[0]?.type === 'paragraph') {
        const [first, ...rest] = node.children
        function withoutTitle(child) {
          if (child.position.end.line <= callout.first) return []
          if (child.position.start.line > callout.first) return [child]
          if (child.children) {
            const children = child.children.flatMap(withoutTitle)
            return children.length ? [{ ...child, children }] : []
          }
          if (child.type !== 'text') return [child]
          const value = child.value.slice(child.value.indexOf('\n') + 1)
          return value ? [{ ...child, value }] : []
        }
        const body = first.children.flatMap(withoutTitle)
        node.data = {
          ...node.data,
          hProperties: { ...node.data?.hProperties, 'data-callout': callout.type },
        }
        node.children = [
          {
            type: 'paragraph',
            data: { hProperties: { className: 'callout-title' } },
            children: [{ type: 'text', value: callout.title || t(`callout.${callout.type}`) }],
          },
          ...(body.length ? [{ ...first, children: body }] : []),
          ...rest,
        ]
      }
      for (const child of node.children ?? []) visit(child)
    }
    visit(tree)
  }
}
