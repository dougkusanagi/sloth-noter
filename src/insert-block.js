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
