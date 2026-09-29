const inline = {
  bold: ['**', '**'],
  italic: ['*', '*'],
  code: ['`', '`'],
}
const inlinePatterns = {
  bold: /\*\*(.+?)\*\*/g,
  italic: /(?<!\*)\*([^*\n]+)\*(?!\*)/g,
  code: /`([^`\n]+)`/g,
  link: /\[([^\]\n]+)\]\(([^)\n]+)\)/g,
}

function selectedLines(text, from, to) {
  const start = text.lastIndexOf('\n', from - 1) + 1
  const newline = text.indexOf('\n', to - 1)
  const end = newline < 0 ? text.length : newline
  return { start, end, lines: text.slice(start, end).split('\n') }
}

function containingToken(text, from, to, action) {
  const pattern = inlinePatterns[action]
  if (!pattern || text.slice(from, to).includes('\n')) return null
  const lineStart = text.lastIndexOf('\n', from - 1) + 1
  const lineEnd = text.indexOf('\n', to - 1)
  const line = text.slice(lineStart, lineEnd < 0 ? text.length : lineEnd)
  for (const match of line.matchAll(pattern)) {
    if (action === 'link' && !/^(https?:|mailto:|#|\/|\.\/|\.\.\/)/i.test(match[2].trim())) continue
    const start = lineStart + match.index,
      end = start + match[0].length
    const prefix = action === 'bold' ? 2 : 1
    const contentStart = start + prefix
    const contentEnd = action === 'link' ? contentStart + match[1].length : end - prefix
    if ((from >= contentStart && to <= contentEnd) || (from === start && to === end))
      return { start, end, contentStart, contentEnd, content: match[1] }
  }
  return null
}

export function activeFormats(text, from, to) {
  if (from === to) return []
  const active = Object.keys(inlinePatterns).filter((action) =>
    containingToken(text, from, to, action),
  )
  const { lines } = selectedLines(text, from, to)
  if (lines.every((line) => /^## /.test(line))) active.push('heading')
  if (lines.every((line) => /^> /.test(line))) active.push('quote')
  if (lines.every((line) => /^[-*] /.test(line))) active.push('list')
  return active
}

export function formatSelection(text, from, to, action, linkUrl = '') {
  if (from === to) return null
  const token = containingToken(text, from, to, action)
  if (token) {
    const selectionFrom = Math.max(
      token.start,
      Math.min(token.start + token.content.length, from - (token.contentStart - token.start)),
    )
    const selectionTo = Math.max(
      token.start,
      Math.min(token.start + token.content.length, to - (token.contentStart - token.start)),
    )
    return { from: token.start, to: token.end, insert: token.content, selectionFrom, selectionTo }
  }
  const url = linkUrl.trim()
  const pair =
    action === 'link' && /^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(url)
      ? ['[', `](${url.replaceAll(')', '%29')})`]
      : inline[action]
  if (pair) {
    const selected = text.slice(from, to)
    return {
      from,
      to,
      insert: `${pair[0]}${selected}${pair[1]}`,
      selectionFrom: from + pair[0].length,
      selectionTo: to + pair[0].length,
    }
  }
  const prefix = { heading: '## ', quote: '> ', list: '- ' }[action]
  if (!prefix) return null
  const { start, end, lines } = selectedLines(text, from, to)
  const active = lines.every((line) => line.startsWith(prefix))
  const insert = lines
    .map((line) => (active ? line.slice(prefix.length) : `${prefix}${line}`))
    .join('\n')
  const before = text.slice(start, from).split('\n').length
  const through = text.slice(start, to).split('\n').length
  const shift = active ? -prefix.length : prefix.length
  return {
    from: start,
    to: end,
    insert,
    selectionFrom: Math.max(start, Math.min(start + insert.length, from + shift * before)),
    selectionTo: Math.max(start, Math.min(start + insert.length, to + shift * through)),
  }
}
