export function continueBlock(text, position) {
  const lineStart = text.lastIndexOf('\n', position - 1) + 1
  const nextBreak = text.indexOf('\n', position)
  const lineEnd = nextBreak < 0 ? text.length : nextBreak
  if (position !== lineEnd) return null
  const before = text.slice(0, lineStart).split('\n')
  let inFence = false
  for (const line of before) if (line.startsWith('```')) inFence = !inFence
  if (inFence) return null
  const line = text.slice(lineStart, lineEnd)
  const list = line.match(/^(\s*)([-*+] |\d+[.)] )(.*)$/)
  const quote = list ? null : line.match(/^(\s*)(> )(.*)$/)
  const match = list ?? quote
  if (!match) return null
  if (!match[3].trim()) return { from: lineStart, to: lineEnd, insert: '', cursor: lineStart }
  const marker = /^\d/.test(match[2])
    ? match[2].replace(/\d+/, (digits) => String(Number(digits) + 1))
    : match[2]
  const insert = `\n${match[1]}${marker}`
  return { from: position, to: position, insert, cursor: position + insert.length }
}
