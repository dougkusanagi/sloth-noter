export function classifyLine(text, inFence) {
  if (text.startsWith('```')) return { kind: 'fence', prefix: text.length, nextFence: !inFence }
  if (inFence) return { kind: 'code', prefix: 0, nextFence: true }
  const heading = text.match(/^(#{1,3}) +/)
  if (heading) return { kind: `h${heading[1].length}`, prefix: heading[0].length, nextFence: false }
  const quote = text.match(/^> +/)
  if (quote) return { kind: 'quote', prefix: quote[0].length, nextFence: false }
  const bullet = text.match(/^[-*] +/)
  if (bullet) return { kind: 'bullet', prefix: bullet[0].length, nextFence: false }
  if (/^\d+\. +/.test(text)) return { kind: 'ordered', prefix: 0, nextFence: false }
  return { kind: 'paragraph', prefix: 0, nextFence: false }
}

export function inlineSyntax(text) {
  const result = []
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|(?<!\*)\*[^*]+\*(?!\*)|\[[^\]]+\]\([^)]+\))/g
  for (const match of text.matchAll(pattern)) {
    const token = match[0], start = match.index, end = start + token.length
    if (token.startsWith('`')) result.push({ kind: 'code', start, end, contentStart: start + 1, contentEnd: end - 1 })
    else if (token.startsWith('**')) result.push({ kind: 'strong', start, end, contentStart: start + 2, contentEnd: end - 2 })
    else if (token.startsWith('*')) result.push({ kind: 'em', start, end, contentStart: start + 1, contentEnd: end - 1 })
    else {
      const close = token.indexOf(']('), href = token.slice(close + 2, -1).trim()
      if (/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(href)) result.push({ kind: 'link', start, end, contentStart: start + 1, contentEnd: start + close })
    }
  }
  for (const match of text.matchAll(/(?<![\p{L}\p{N}_])#[\p{L}\p{N}_/-]+/gu)) {
    const start = match.index, end = start + match[0].length
    if (!result.some(token => start < token.end && end > token.start)) result.push({ kind: 'tag', start, end, contentStart: start, contentEnd: end })
  }
  return result.sort((a, b) => a.start - b.start)
}
