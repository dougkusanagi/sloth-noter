import { test } from 'node:test'
import assert from 'node:assert/strict'
import { columnsTemplate } from './columns.js'
import { dropBeside, moveAcross, removeColumn, unwrapColumns } from './column-drop.js'

const range = (text, part) => {
  const from = text.indexOf(part)
  return { from, to: from + part.length }
}

test('a block dropped beside another makes two columns', () => {
  const text = '# Nota\n\nUm\n\nDois\n\nTrês'
  assert.equal(
    dropBeside(text, range(text, 'Três'), range(text, 'Um'), 'right'),
    `# Nota\n\n${columnsTemplate(['Um', 'Três'])}\n\nDois`,
  )
  assert.equal(
    dropBeside(text, range(text, 'Um'), range(text, 'Três'), 'left'),
    `# Nota\n\nDois\n\n${columnsTemplate(['Um', 'Três'])}`,
  )
  assert.equal(dropBeside(text, range(text, 'Um'), range(text, 'Um'), 'left'), null)
})

test('a block dropped beside a columns block becomes a new column', () => {
  const layout = columnsTemplate(['A', 'B'])
  const text = `# Nota\n\n${layout}\n\nC`
  assert.equal(
    dropBeside(text, range(text, 'C'), range(text, layout), 'right'),
    `# Nota\n\n${columnsTemplate(['A', 'B', 'C'])}`,
  )
  assert.equal(
    dropBeside(text, range(text, 'C'), range(text, layout), 'left', 1),
    `# Nota\n\n${columnsTemplate(['A', 'C', 'B'])}`,
  )
})

test('moving the only block out of a column removes the column, and one column ends the layout', () => {
  const three = `# Nota\n\n${columnsTemplate(['A', 'B', 'C'])}\n\nFim`
  assert.equal(
    moveAcross(three, range(three, 'B'), three.indexOf('Fim')),
    `# Nota\n\n${columnsTemplate(['A', 'C'])}\n\nB\n\nFim`,
  )
  const two = `# Nota\n\n${columnsTemplate(['A', 'B'])}\n\nFim`
  assert.equal(moveAcross(two, range(two, 'B'), two.indexOf('Fim')), '# Nota\n\nA\n\nB\n\nFim')
})

test('a block moves into a column, above a block or at the column end', () => {
  const text = `# Nota\n\n${columnsTemplate(['A', 'B'])}\n\nNovo`
  assert.equal(
    moveAcross(text, range(text, 'Novo'), text.indexOf('B')),
    `# Nota\n\n${columnsTemplate(['A', 'Novo\n\nB'])}`,
  )
  assert.equal(
    moveAcross(text, range(text, 'Novo'), text.indexOf('A') + 1),
    `# Nota\n\n${columnsTemplate(['A\n\nNovo', 'B'])}`,
  )
})

test('removing a column keeps the others; the last two end the layout', () => {
  const text = `# Nota\n\n${columnsTemplate(['A', '', 'C'])}`
  const from = text.indexOf('<!--')
  assert.equal(removeColumn(text, from, 1), `# Nota\n\n${columnsTemplate(['A', 'C'])}`)
  const two = `# Nota\n\n${columnsTemplate(['A', ''])}`
  assert.equal(removeColumn(two, from, 1), '# Nota\n\nA')
  assert.equal(unwrapColumns(text, from), '# Nota\n\nA\n\nC')
})

test('a list item moved away leaves its siblings apart from the layout', () => {
  const text = `# Nota\n\n${columnsTemplate(['A', 'B'])}\n\n- um\n- dois`
  assert.equal(
    moveAcross(text, range(text, '- um'), text.indexOf('B')),
    `# Nota\n\n${columnsTemplate(['A', '- um\n\nB'])}\n\n- dois`,
  )
})

test('a block of a column dropped beside another column of the layout makes a new column', () => {
  const layout = columnsTemplate(['A', 'B\n\nC'])
  const text = `# Nota\n\n${layout}`
  assert.equal(
    dropBeside(text, range(text, 'C'), range(text, layout), 'right', 2),
    `# Nota\n\n${columnsTemplate(['A', 'B', 'C'])}`,
  )
  // Its own column, now empty, goes away.
  const two = `# Nota\n\n${columnsTemplate(['A', 'B'])}`
  const group = range(two, two.slice(two.indexOf('<!--')))
  assert.equal(
    dropBeside(two, range(two, 'B'), group, 'left', 0),
    `# Nota\n\n${columnsTemplate(['B', 'A'])}`,
  )
})
