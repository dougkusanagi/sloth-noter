import { markdownTree, walk } from './markdown-model.js'
export function continueBlock(text, position) {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1
  const nextBreak = text.indexOf('\n', position)
  const lineEnd = nextBreak < 0 ? text.length : nextBreak
  if (position !== lineEnd) return null
  let inCode = false
  walk(markdownTree(text), (node) => {
    if (
      node.type === 'code' &&
      position >= node.position.start.offset &&
      position <= node.position.end.offset
    )
      inCode = true
  })
  if (inCode) return null
  const line = text.slice(lineStart, lineEnd)
  const list = line.match(/^(\s*)([-*+] |\d+[.)] )(.*)$/)
  const quote = list ? null : line.match(/^(\s*)(> )(.*)$/)
  const match = list ?? quote
  if (!match) return null
  const task = list && match[3].match(/^\[([ xX])\]\s*(.*)$/)
  if (!match[3].trim() || (task && !task[2].trim()))
    return { from: lineStart, to: lineEnd, insert: '', cursor: lineStart }
  const marker = /^\d/.test(match[2])
    ? match[2].replace(/\d+/, (digits) => String(Number(digits) + 1))
    : match[2]
  const insert = `\n${match[1]}${marker}${task ? '[ ] ' : ''}`
  return { from: position, to: position, insert, cursor: position + insert.length }
}
