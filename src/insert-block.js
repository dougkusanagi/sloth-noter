const blocks = {
  h2: ['## ', 3, 3],
  h3: ['### ', 4, 4],
  h4: ['#### ', 5, 5],
  quote: ['> ', 2, 2],
  list: ['- ', 2, 2],
  numbered: ['1. ', 3, 3],
  table: ['| Coluna 1 | Coluna 2 |\n| --- | --- |\n| Valor 1 | Valor 2 |', 2, 10],
  code: ['```\n\n```', 4, 4],
}

export function blockTemplate(action) {
  const block = blocks[action]
  return block ? { text: block[0], selectionFrom: block[1], selectionTo: block[2] } : null
}

/** The same edit for menu actions and keyboard shortcuts in both text editors. */
export function blockEdit(text, from, to, action) {
  const template = blockTemplate(action)
  if (!template) return null
  const titleEnd = text.indexOf('\n') < 0 ? text.length : text.indexOf('\n')
  if (from <= titleEnd) {
    return {
      from: titleEnd,
      to: titleEnd,
      insert: `\n\n${template.text}\n`,
      selectionFrom: titleEnd + 2 + template.selectionFrom,
      selectionTo: titleEnd + 2 + template.selectionTo,
    }
  }
  const prefix = { h2: '## ', h3: '### ', h4: '#### ', quote: '> ', list: '- ', numbered: '1. ' }[
    action
  ]
  if (prefix) {
    const start = text.lastIndexOf('\n', from - 1) + 1
    const newline = text.indexOf('\n', Math.max(from, to - 1))
    const end = newline < 0 ? text.length : newline
    const lines = text.slice(start, end).split('\n')
    const active = lines.every((line) => line.startsWith(prefix))
    const removed = lines.map((line) =>
      active ? prefix.length : (line.match(/^(?:#{1,6}|[-*+]|\d+[.)]|>)\s+/)?.[0].length ?? 0),
    )
    const next = lines.map((line, index) => (active ? '' : prefix) + line.slice(removed[index]))
    const map = (position) => {
      position = Math.min(position, end)
      const before = text.slice(start, position).split('\n')
      const index = before.length - 1
      return (
        start +
        next.slice(0, index).reduce((length, line) => length + line.length + 1, 0) +
        (active ? 0 : prefix.length) +
        Math.max(0, before[index].length - removed[index])
      )
    }
    return {
      from: start,
      to: end,
      insert: next.join('\n'),
      selectionFrom: map(from),
      selectionTo: map(to),
    }
  }
  if (action === 'table') {
    // A table goes before the current paragraph; selecting text must not discard it.
    from = text.lastIndexOf('\n', from - 1) + 1
    to = from
  }
  const before = text[from - 1] === '\n' ? '' : '\n\n'
  const after = to < text.length && text[to] !== '\n' ? '\n\n' : ''
  const selected = action === 'code' ? text.slice(from, to) : ''
  const insert = action === 'code' && selected ? `\`\`\`\n${selected}\n\`\`\`` : template.text
  return {
    from,
    to,
    insert: before + insert + after,
    selectionFrom: from + before.length + template.selectionFrom,
    selectionTo:
      from +
      before.length +
      (selected ? template.selectionFrom + selected.length : template.selectionTo),
  }
}
