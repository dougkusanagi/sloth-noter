export function classifyLine(text, inFence) {
  if (text.startsWith('```')) return { kind: 'fence', prefix: text.length, nextFence: !inFence }
  if (inFence) return { kind: 'code', prefix: 0, nextFence: true }
  const heading = text.match(/^(#{1,4}) +/)
  if (heading) return { kind: `h${heading[1].length}`, prefix: heading[0].length, nextFence: false }
  const quote = text.match(/^> +/)
  if (quote) return { kind: 'quote', prefix: quote[0].length, nextFence: false }
  const bullet = text.match(/^[-*] +/)
  if (bullet) return { kind: 'bullet', prefix: bullet[0].length, nextFence: false }
  if (/^\d+\. +/.test(text)) return { kind: 'ordered', prefix: 0, nextFence: false }
  if (/^\|.*\|$/.test(text)) return { kind: 'table', prefix: 0, nextFence: false }
  return { kind: 'paragraph', prefix: 0, nextFence: false }
}

export function inlineSyntax(text) {
  const result = []
  const source = /(`[^`\n]+`|\*\*((?:(?!\*\*(?!\*)).)+)\*\*(?!\*)|(?<!\*)\*[^*\n]+\*(?!\*)|\[[^\]\n]+\]\([^)\n]+\))/g
  function collect(part, offset) {
    for (const match of part.matchAll(new RegExp(source.source, 'g'))) {
      const token = match[0], start = offset + match.index, end = start + token.length
      let kind, contentStart, contentEnd
      if (token.startsWith('`')) { kind = 'code'; contentStart = start + 1; contentEnd = end - 1 }
      else if (token.startsWith('**')) { kind = 'strong'; contentStart = start + 2; contentEnd = end - 2 }
      else if (token.startsWith('*')) { kind = 'em'; contentStart = start + 1; contentEnd = end - 1 }
      else {
        const close = token.indexOf(']('), href = token.slice(close + 2, -1).trim()
        if (!/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(href)) continue
        kind = 'link'; contentStart = start + 1; contentEnd = start + close
      }
      result.push({ kind, start, end, contentStart, contentEnd })
      if (kind !== 'code') collect(text.slice(contentStart, contentEnd), contentStart)
    }
  }
  collect(text, 0)
  for (const match of text.matchAll(/(?<![\p{L}\p{N}_])#[\p{L}\p{N}_/-]+/gu)) {
    const start = match.index, end = start + match[0].length
    if (!result.some(token => (token.kind === 'code' || token.kind === 'link') && start < token.end && end > token.start)) result.push({ kind: 'tag', start, end, contentStart: start, contentEnd: end })
  }
  return result.sort((a, b) => a.start - b.start)
}
