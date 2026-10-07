import { markdownTree, walk, wikiParts } from './markdown-model.js'
export function classifyLine(text, inFence) {
  if (text.startsWith('```')) return { kind: 'fence', prefix: text.length, nextFence: !inFence }
  if (inFence) return { kind: 'code', prefix: 0, nextFence: true }
  const heading = text.match(/^(#{1,6}) +/)
  if (heading) return { kind: `h${heading[1].length}`, prefix: heading[0].length, nextFence: false }
  if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(text))
    return { kind: 'rule', prefix: text.length, nextFence: false }
  const quote = text.match(/^> +/)
  if (quote) return { kind: 'quote', prefix: quote[0].length, nextFence: false }
  const bullet = text.match(/^\s*[-*+] +/)
  if (bullet) return { kind: 'bullet', prefix: bullet[0].length, nextFence: false }
  if (/^\d+\. +/.test(text)) return { kind: 'ordered', prefix: 0, nextFence: false }
  if (/^[ \t]*\|.*\|[ \t]*$/.test(text)) return { kind: 'table', prefix: 0, nextFence: false }
  return { kind: 'paragraph', prefix: 0, nextFence: false }
}

export function inlineSyntax(text, definitions = '') {
  const result = []
  const tree = markdownTree(text + (definitions ? `\n\n${definitions}` : ''))
  function collect(node, inLink = false) {
    const start = node.position?.start.offset,
      end = node.position?.end.offset
    if (node.type !== 'root' && (start === undefined || end > text.length)) return
    let kind = {
      strong: 'strong',
      emphasis: 'em',
      inlineCode: 'code',
      delete: 'strike',
      link: 'link',
      linkReference: 'link',
      footnoteReference: 'footnote',
    }[node.type]
    if (kind) {
      let contentStart = start,
        contentEnd = end
      const raw = text.slice(start, end)
      if (kind === 'code') {
        const width = raw.match(/^`+/)[0].length
        contentStart += width
        contentEnd -= width
      } else if (kind === 'link') {
        const href = node.url ?? definitionMap(tree).get(node.identifier)
        if (!href || !/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(href)) return
        contentStart = node.children?.[0]?.position?.start.offset ?? start
        contentEnd = node.children?.at(-1)?.position?.end.offset ?? contentStart
        result.push({ kind, start, end, contentStart, contentEnd, href })
        for (const child of node.children ?? []) collect(child, true)
        return
      } else if (kind === 'footnote') {
        contentStart += 2
        contentEnd--
      } else {
        const width = kind === 'strong' || kind === 'strike' ? 2 : 1
        contentStart += width
        contentEnd -= width
      }
      result.push({ kind, start, end, contentStart, contentEnd })
    }
    if (node.type === 'text' && !inLink) {
      const raw = text.slice(start, end)
      for (const match of raw.matchAll(/(?<!\\)\[\[([^\]\n]+)\]\]/g)) {
        const at = start + match.index,
          parts = wikiParts(match[1])
        const labelAt = match[1].includes('|') ? match[1].indexOf('|') + 1 : 0
        result.push({
          kind: 'wiki',
          start: at,
          end: at + match[0].length,
          contentStart: at + 2 + labelAt,
          contentEnd: at + match[0].length - 2,
          target: match[1],
          label: parts.label,
        })
      }
    }
    if (node.type !== 'inlineCode' && node.type !== 'code')
      for (const child of node.children ?? []) collect(child, inLink)
  }
  collect(tree)
  for (const match of text.matchAll(/(?<![\p{L}\p{N}_])#[\p{L}\p{N}_/-]+/gu)) {
    const start = match.index,
      end = start + match[0].length
    if (
      !result.some(
        (token) =>
          ['code', 'link', 'wiki'].includes(token.kind) && start < token.end && end > token.start,
      )
    )
      result.push({ kind: 'tag', start, end, contentStart: start, contentEnd: end })
  }
  return result.sort((a, b) => a.start - b.start)
}
function definitionMap(tree) {
  const result = new Map()
  walk(tree, (node) => {
    if (node.type === 'definition') result.set(node.identifier, node.url)
  })
  return result
}
