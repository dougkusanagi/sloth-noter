function isSpace(character) {
  return character === ' ' || character === '\t'
}

function makeCell(line, rawFrom, rawTo, index) {
  let from = rawFrom
  let to = rawTo
  while (from < to && isSpace(line[from])) from++
  while (to > from && isSpace(line[to - 1])) to--
  return { index, rawFrom, rawTo, from, to, value: line.slice(from, to) }
}

export function parseTableLine(line) {
  const start = line.search(/\S|$/)
  let end = line.length
  while (end > start && /\s/.test(line[end - 1])) end--
  if (line[start] !== '|' || line[end - 1] !== '|') return null
  const cells = []
  let rawFrom = start + 1
  let inCode = false
  for (let index = start + 1; index < end - 1; index++) {
    const character = line[index]
    if (character === '\\' && (line[index + 1] === '|' || line[index + 1] === '`')) {
      index++
      continue
    }
    if (character === '`') inCode = !inCode
    if (character === '|' && !inCode) {
      cells.push(makeCell(line, rawFrom, index, cells.length))
      rawFrom = index + 1
    }
  }
  cells.push(makeCell(line, rawFrom, end - 1, cells.length))
  return { start, end, cells }
}

export function tableCells(line) {
  return parseTableLine(line)?.cells.map((cell) => cell.value) ?? null
}

export function isTableDivider(line) {
  const cells = tableCells(line)
  return Boolean(cells?.length && cells.every((cell) => /^:?-+:?$/.test(cell)))
}

export function tableGroupDetails(lines, index) {
  const header = parseTableLine(lines[index] ?? '')
  const divider = parseTableLine(lines[index + 1] ?? '')
  if (!header || !divider || !isTableDivider(lines[index + 1] ?? '')) return null
  const rows = []
  let end = index + 2
  while (end < lines.length) {
    const row = parseTableLine(lines[end])
    if (!row) break
    rows.push(row)
    end++
  }
  return {
    start: index,
    end,
    header,
    divider,
    rows,
    lines: lines.slice(index, end),
    columnCount: Math.max(header.cells.length, ...rows.map((row) => row.cells.length)),
  }
}

export function tableGroup(lines, index) {
  const group = tableGroupDetails(lines, index)
  if (!group) return null
  return {
    start: group.start,
    end: group.end,
    headers: group.header.cells.map((cell) => cell.value),
    rows: group.rows.map((row) => row.cells.map((cell) => cell.value)),
  }
}

export function tableCellAtOffset(parsed, offset) {
  if (!parsed?.cells.length) return -1
  let best = 0
  let distance = Infinity
  for (const cell of parsed.cells) {
    const current =
      offset < cell.from ? cell.from - offset : offset > cell.to ? offset - cell.to : 0
    if (current < distance) {
      best = cell.index
      distance = current
    }
  }
  return best
}

export function tableCellAtColumn(parsed, column) {
  if (!parsed || column < 0) return null
  return (
    parsed.cells[column] ?? {
      index: column,
      rawFrom: parsed.end - 1,
      rawTo: parsed.end - 1,
      from: parsed.end - 1,
      to: parsed.end - 1,
      value: '',
    }
  )
}
