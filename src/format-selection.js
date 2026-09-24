const inline = {
  bold: ['**', '**'], italic: ['*', '*'], code: ['`', '`'],
}

export function formatSelection(text, from, to, action, linkUrl = '') {
  if (from === to) return null
  const url = linkUrl.trim()
  const pair = action === 'link' && /^(https?:\/\/|mailto:|#|\/|\.\/|\.\.\/)/i.test(url) ? ['[', `](${url.replaceAll(')', '%29')})`] : inline[action]
  if (pair) {
    const selected = text.slice(from, to)
    return { from, to, insert: `${pair[0]}${selected}${pair[1]}`, selectionFrom: from + pair[0].length, selectionTo: to + pair[0].length }
  }
  const lineStart = text.lastIndexOf('\n', from - 1) + 1
  const lineEnd = text.indexOf('\n', to - 1)
  const end = lineEnd < 0 ? text.length : lineEnd
  const prefix = { heading: '## ', quote: '> ', list: '- ' }[action]
  if (!prefix) return null
  const selected = text.slice(lineStart, end)
  const insert = selected.split('\n').map(line => `${prefix}${line}`).join('\n')
  return { from: lineStart, to: end, insert, selectionFrom: from + prefix.length, selectionTo: to + prefix.length * selected.split('\n').length }
}
