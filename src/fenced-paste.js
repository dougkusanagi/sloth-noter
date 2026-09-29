export function fencedPasteInEmptyBlock(doc, from, to, pasted) {
  if (from !== to) return null
  const match = pasted.match(/^```([^\r\n`]*)\r?\n([\s\S]*?)\r?\n```[ \t]*(?:\r?\n)?$/)
  if (!match) return null

  const line = doc.lineAt(from)
  if (line.text || from !== line.from || line.number === 1 || line.number === doc.lines) return null
  const opening = doc.line(line.number - 1)
  const closing = doc.line(line.number + 1)
  if (!/^```[ \t]*$/.test(opening.text) || !/^```[ \t]*$/.test(closing.text)) return null

  const language = match[1].trim()
  const code = match[2].replace(/\r\n/g, '\n')
  const insert = `\`\`\`${language}\n${code}\n\`\`\``
  return {
    from: opening.from,
    to: closing.to,
    insert,
    selection: opening.from + 4 + language.length + code.length,
  }
}
