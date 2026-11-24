import { markdownTree, walk } from './markdown-model.js'

function paragraphBelow(text, lineEnd) {
  // When the next block touches this one, reserve a separator below the new paragraph too.
  // An existing blank line or the end of the note already leaves room for the caret.
  const nextLine = text.slice(lineEnd + 1).split('\n', 1)[0]
  const insert = nextLine.trim() ? '\n\n\n' : '\n\n'
  return { from: lineEnd, to: lineEnd, insert, cursor: lineEnd + 2 }
}

export function continueBlock(text, position) {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1
  const nextBreak = text.indexOf('\n', position)
  const lineEnd = nextBreak < 0 ? text.length : nextBreak
  const tree = markdownTree(text)
  // Enter in ordinary text starts a new paragraph; Shift+Enter keeps a line break.
  const paragraph = tree.children.find(
    (node) =>
      node.type === 'paragraph' &&
      position >= node.position.start.offset &&
      position <= node.position.end.offset,
  )
  // A fenced code block at the top level: Enter on its fence lines acts on the block as a whole.
  const fenced = tree.children.find(
    (node) =>
      node.type === 'code' &&
      position >= node.position.start.offset &&
      position <= node.position.end.offset &&
      /^\s*(`{3,}|~{3,})/.test(text.slice(node.position.start.offset)),
  )
  const onClosingFence =
    fenced &&
    lineEnd === fenced.position.end.offset &&
    lineStart > fenced.position.start.offset &&
    /^\s*(`{3,}|~{3,})\s*$/.test(text.slice(lineStart, lineEnd))
  // Anywhere on the closing fence (the arrow keys put the cursor at its start), Enter starts a new
  // paragraph below the block, apart from it by the standard gap. It never adds a line to the code.
  if (onClosingFence) return paragraphBelow(text, lineEnd)
  // At the start of a line, a plain line break already leaves an empty line before the text.
  if (paragraph && position > lineStart && text.slice(lineStart, lineEnd).trim())
    return position === lineEnd && position === paragraph.position.end.offset
      ? paragraphBelow(text, lineEnd)
      : { from: position, to: position, insert: '\n\n', cursor: position + 2 }
  // At the start of a paragraph, Enter leaves an empty paragraph above it, kept apart from both
  // neighbours by the standard gap, so text typed there is a paragraph of its own. Below the note
  // title, the plain line break is kept: that line is the subtitle.
  // At the start of a code block's opening fence, the same empty paragraph goes above the block.
  const block = paragraph ?? (fenced && position === fenced.position.start.offset ? fenced : null)
  if (block && position === lineStart && position === block.position.start.offset) {
    const above = tree.children.filter((node) => node.position.end.line < block.position.start.line)
    const previous = above.at(-1)
    if (previous && !(previous.type === 'heading' && previous.depth === 1)) {
      const blankAbove = !text
        .slice(text.lastIndexOf('\n', lineStart - 2) + 1, lineStart - 1)
        .trim()
      const insert = blankAbove ? '\n\n' : '\n\n\n'
      return { from: position, to: position, insert, cursor: position + insert.length }
    }
  }
  if (position !== lineEnd) return null
  let code = null
  walk(tree, (node) => {
    if (
      node.type === 'code' &&
      position >= node.position.start.offset &&
      position <= node.position.end.offset
    )
      code = node
  })
  // Enter after a closing fence starts a new paragraph below the block, like in a paragraph.
  if (
    code &&
    position === code.position.end.offset &&
    lineStart > code.position.start.offset &&
    /^\s*(`{3,}|~{3,})\s*$/.test(text.slice(lineStart, lineEnd))
  )
    return paragraphBelow(text, lineEnd)
  if (code) return null
  const line = text.slice(lineStart, lineEnd)
  const list = line.match(/^(\s*)([-*+] |\d+[.)] )(.*)$/)
  const quote = list ? null : line.match(/^(\s*)(> )(.*)$/)
  const match = list ?? quote
  if (!match) return null
  const task = list && match[3].match(/^\[([ xX-])\]\s*(.*)$/)
  if (!match[3].trim() || (task && !task[2].trim()))
    return { from: lineStart, to: lineEnd, insert: '', cursor: lineStart }
  const marker = /^\d/.test(match[2])
    ? match[2].replace(/\d+/, (digits) => String(Number(digits) + 1))
    : match[2]
  const insert = `\n${match[1]}${marker}${task ? '[ ] ' : ''}`
  return { from: position, to: position, insert, cursor: position + insert.length }
}
