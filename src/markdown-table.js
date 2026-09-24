export function tableCells(line) {
  if (!/^\|.*\|$/.test(line.trim())) return null
  return line.trim().slice(1, -1).split('|').map(cell => cell.trim())
}

export function isTableDivider(line) {
  const cells = tableCells(line)
  return Boolean(cells?.length && cells.every(cell => /^:?-+:?$/.test(cell)))
}

export function tableGroup(lines, index) {
  if (!tableCells(lines[index] ?? '') || !isTableDivider(lines[index + 1] ?? '')) return null
  let end = index + 2
  while (end < lines.length && tableCells(lines[end])) end++
  return { start: index, end, headers: tableCells(lines[index]), rows: lines.slice(index + 2, end).map(tableCells) }
}
