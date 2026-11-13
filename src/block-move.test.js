import test from 'node:test'
import assert from 'node:assert/strict'
import { documentBlocks, moveBlockChanges } from './block-move.js'

const apply = (text, result) => {
  // Changes are in original offsets; apply from the end.
  const sorted = [...result.changes].sort((a, b) => b.from - a.from)
  let out = text
  for (const change of sorted)
    out = out.slice(0, change.from) + (change.insert ?? '') + out.slice(change.to ?? change.from)
  return out
}
const move = (text, first, last, before) => {
  const result = moveBlockChanges(text, first, last, before)
  return result ? apply(text, result) : text
}

const NOTE = ['# Nota', '', '## A', '', 'texto a', '', '## B', '', 'texto b'].join('\n')

test('blocks skip the title and split lists into items', () => {
  const text = ['# Nota', '', 'Par', 'ágrafo', '', '- um', '  - sub', '- dois', '', '## T'].join(
    '\n',
  )
  assert.deepEqual(
    documentBlocks(text).map(({ first, last, kind }) => [first, last, kind]),
    [
      [3, 4, 'p'],
      [6, 7, 'list'],
      [8, 8, 'list'],
      [10, 10, 'h2'],
    ],
  )
})

test('a table keeps its header comment as one block', () => {
  const text = ['# N', '', '<!-- sloth:table header-column -->', '| A |', '| --- |', '| 1 |'].join(
    '\n',
  )
  assert.deepEqual(
    documentBlocks(text).map(({ first, last, kind }) => [first, last, kind]),
    [[3, 6, 'table']],
  )
})

test('moving one heading line keeps blank lines between blocks', () => {
  assert.equal(
    move(NOTE, 3, 3, 9),
    ['# Nota', '', 'texto a', '', '## B', '', '## A', '', 'texto b'].join('\n'),
  )
  assert.equal(
    move(NOTE, 7, 7, 3),
    ['# Nota', '', '## B', '', '## A', '', 'texto a', '', 'texto b'].join('\n'),
  )
})

test('moving to the end and back', () => {
  assert.equal(
    move(NOTE, 3, 5, 99),
    ['# Nota', '', '## B', '', 'texto b', '', '## A', '', 'texto a'].join('\n'),
  )
  assert.equal(move(NOTE, 9, 9, 99), NOTE)
})

test('dropping a block onto itself does nothing', () => {
  assert.equal(moveBlockChanges(NOTE, 5, 5, 5), null)
  assert.equal(moveBlockChanges(NOTE, 5, 5, 6), null)
  assert.equal(moveBlockChanges(NOTE, 5, 5, 7), null)
})

test('list items stay tight inside a list', () => {
  const text = ['# N', '', '- um', '- dois', '- três', '', 'fim'].join('\n')
  assert.equal(move(text, 3, 3, 6), ['# N', '', '- dois', '- três', '- um', '', 'fim'].join('\n'))
  assert.equal(move(text, 5, 5, 3), ['# N', '', '- três', '- um', '- dois', '', 'fim'].join('\n'))
  // Leaving the list puts blank lines around the item.
  assert.equal(
    move(text, 4, 4, 99),
    ['# N', '', '- um', '- três', '', 'fim', '', '- dois'].join('\n'),
  )
})

test('a paragraph moved between list items is separated from them', () => {
  const text = ['# N', '', 'texto', '', '- um', '- dois'].join('\n')
  assert.equal(move(text, 3, 3, 6), ['# N', '', '- um', '', 'texto', '', '- dois'].join('\n'))
})

test('moving the last block up leaves no trailing blank line', () => {
  assert.equal(
    move(NOTE, 9, 9, 3),
    ['# Nota', '', 'texto b', '', '## A', '', 'texto a', '', '## B'].join('\n'),
  )
})

test('moving a separator to the trailing empty line and back preserves spacing', () => {
  for (const ending of ['\n', '\n\n', '\n\n\n']) {
    const original = '# Nota\n\n## H2\n\n---\n\n- [x] Teste 1\n- [ ] Teste 2' + ending
    let text = original
    for (let attempt = 0; attempt < 3; attempt++) {
      const separator = documentBlocks(text).find(
        (block) => text.split('\n')[block.first - 1] === '---',
      )
      text = move(text, separator.first, separator.last, text.split('\n').length + 1)
      const moved = documentBlocks(text).find(
        (block) => text.split('\n')[block.first - 1] === '---',
      )
      const task = documentBlocks(text).find((block) => block.kind === 'task')
      text = move(text, moved.first, moved.last, task.first)
      assert.equal(text, original)
    }
  }
})

test('moving a rule below tasks does not insert an empty line', () => {
  const original = '# Nota\n\n## H2\n---\n- [x] Teste 1\n- [ ] Teste 2\n'
  const down = move(original, 4, 4, 99)
  assert.equal(down, '# Nota\n\n## H2\n- [x] Teste 1\n- [ ] Teste 2\n---\n')
  assert.equal(move(down, 6, 6, 4), original)
  assert.equal(documentBlocks(down).filter((block) => block.kind === 'task').length, 2)
})
