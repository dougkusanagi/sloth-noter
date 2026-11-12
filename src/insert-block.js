import { t } from './i18n.js'
import { columnsTemplate } from './columns.js'

const blocks = {
  task: ['- [ ] ', 6, 6],
  divider: ['---', 3, 3],
  h1: ['# ', 2, 2],
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
  if (action === 'date') {
    const text = new Intl.DateTimeFormat(
      globalThis.document?.documentElement.lang || 'pt-BR',
    ).format(new Date())
    return { text, selectionFrom: text.length, selectionTo: text.length }
  }
  // An empty paragraph clears the block prefix of the current line.
  if (action === 'p') return { text: '', selectionFrom: 0, selectionTo: 0 }
  if (action === 'columns') {
    const text = columnsTemplate(['', ''])
    const start = text.indexOf('<!-- sloth:column -->') + '<!-- sloth:column -->\n\n'.length
    return { text, selectionFrom: start, selectionTo: start }
  }
  if (action === 'accordion') {
    const prefix = '<details>\n<summary>'
    const title = t('accordion.title')
    return {
      text: `${prefix}${title}</summary>\n\n\n\n</details>`,
      selectionFrom: prefix.length,
      selectionTo: prefix.length + title.length,
    }
  }
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
  const prefix = {
    task: '- [ ] ',
    h1: '# ',
    h2: '## ',
    h3: '### ',
    h4: '#### ',
    quote: '> ',
    list: '- ',
    numbered: '1. ',
    p: '',
  }[action]
  if (prefix !== undefined) {
    const start = text.lastIndexOf('\n', from - 1) + 1
    const newline = text.indexOf('\n', Math.max(from, to - 1))
    const end = newline < 0 ? text.length : newline
    const lines = text.slice(start, end).split('\n')
    const active = lines.every((line) => line.startsWith(prefix))
    const removed = lines.map((line) => {
      if (prefix && active) return prefix.length
      return line.match(/^(?:#{1,6}|[-*+]|\d+[.)]|>)\s+/)?.[0].length ?? 0
    })
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
  const selected = ['code', 'accordion', 'columns'].includes(action) ? text.slice(from, to) : ''
  const insert =
    action === 'code' && selected
      ? `\`\`\`\n${selected}\n\`\`\``
      : action === 'accordion' && selected
        ? template.text.replace('\n\n\n\n</details>', `\n\n${selected}\n\n</details>`)
        : action === 'columns' && selected
          ? columnsTemplate([selected, ''])
          : template.text
  return {
    from,
    to,
    insert: before + insert + after,
    selectionFrom: from + before.length + template.selectionFrom,
    selectionTo:
      from +
      before.length +
      (selected && action === 'code'
        ? template.selectionFrom + selected.length
        : template.selectionTo),
  }
}
