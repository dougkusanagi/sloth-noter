import test from 'node:test'
import assert from 'node:assert/strict'
import { applyChanges } from './list-indent.js'
import { moveSectionBy, moveSectionTo } from './section-move.js'

const NOTE = [
  '# Notas',
  '',
  '## A',
  '',
  'tarefa a',
  '',
  '## B',
  '',
  'tarefa b',
  '',
  '## C',
  '',
  'tarefa c',
].join('\n')

const lineOf = (text, mark) => text.slice(0, text.indexOf(mark)).split('\n').length
const moveBy = (text, mark, direction) => {
  const result = moveSectionBy(text, lineOf(text, mark), direction)
  return result && applyChanges(text, result.changes)
}
const moveTo = (text, mark, slot) => {
  const result = moveSectionTo(text, lineOf(text, mark), slot)
  return result && applyChanges(text, result.changes)
}

test('swaps whole sections in both directions, keeping blank lines between them', () => {
  const b = lineOf(NOTE, '## B')
  const up = moveSectionBy(NOTE, b, -1)
  const upText = applyChanges(NOTE, up.changes)
  assert.equal(
    upText,
    [
      '# Notas',
      '',
      '## B',
      '',
      'tarefa b',
      '',
      '## A',
      '',
      'tarefa a',
      '',
      '## C',
      '',
      'tarefa c',
    ].join('\n'),
  )
  // The caret lands on the moved heading in the new text.
  assert.equal(upText.slice(up.anchor, up.anchor + 4), '## B')
  assert.equal(moveBy(upText, '## B', 1), NOTE)
  const down = moveSectionBy(NOTE, b, 1)
  const downText = applyChanges(NOTE, down.changes)
  assert.equal(
    downText,
    [
      '# Notas',
      '',
      '## A',
      '',
      'tarefa a',
      '',
      '## C',
      '',
      'tarefa c',
      '',
      '## B',
      '',
      'tarefa b',
    ].join('\n'),
  )
  assert.equal(downText.slice(down.anchor, down.anchor + 4), '## B')
  assert.equal(moveBy(downText, '## B', -1), NOTE)
})

test('stays put at the ends of its sibling run', () => {
  const first = moveSectionBy(NOTE, lineOf(NOTE, '## A'), -1)
  assert.deepEqual(first, { changes: [], anchor: -1, head: -1 })
  const last = moveSectionBy(NOTE, lineOf(NOTE, '## C'), 1)
  assert.deepEqual(last, { changes: [], anchor: -1, head: -1 })
})

test('is only for section headings H2-H6, not the note title', () => {
  assert.equal(moveSectionBy(NOTE, 1, 1), null)
  const taskLine = lineOf(NOTE, 'tarefa b')
  assert.equal(moveSectionBy(NOTE, taskLine, 1), null)
  assert.equal(moveSectionBy(NOTE, 9999, 1), null)
  assert.equal(moveSectionTo(NOTE, taskLine, 0), null)
})

test('drags across two siblings in one replace', () => {
  const a = lineOf(NOTE, '## A')
  const result = moveSectionTo(NOTE, a, 2)
  const text = applyChanges(NOTE, result.changes)
  assert.equal(
    text,
    [
      '# Notas',
      '',
      '## B',
      '',
      'tarefa b',
      '',
      '## C',
      '',
      'tarefa c',
      '',
      '## A',
      '',
      'tarefa a',
    ].join('\n'),
  )
  assert.equal(text.slice(result.anchor, result.anchor + 4), '## A')
  assert.equal(moveTo(text, '## A', 0), NOTE)
  // Slot clamps to the run: beyond the last sibling is the end.
  assert.equal(moveTo(NOTE, '## A', 99), text)
})

test('carries subsections and blank gaps with their parent section', () => {
  const text = [
    '# Notas',
    '',
    '## A',
    '',
    'intro a',
    '',
    '### A-1',
    '',
    'sub a',
    '',
    '## B',
    '',
    'tarefa b',
  ].join('\n')
  const moved = moveBy(text, '## B', -1)
  assert.equal(
    moved,
    [
      '# Notas',
      '',
      '## B',
      '',
      'tarefa b',
      '',
      '## A',
      '',
      'intro a',
      '',
      '### A-1',
      '',
      'sub a',
    ].join('\n'),
  )
  assert.equal(moveBy(moved, '## B', 1), text)
})

test('survives documents without the trailing blank line and unordered gaps', () => {
  const text = ['## A', 'tarefa a', '', '', '## B', 'tarefa b'].join('\n')
  const moved = moveBy(text, '## B', -1)
  // A's double gap stays attached before B; A's own tail gap goes below the pair.
  assert.equal(moved, ['## B', 'tarefa b', '', '## A', 'tarefa a'].join('\n'))
  // The forward move normalized the double gap, so there is no way back to it.
  assert.equal(moveBy(moved, '## B', 1), ['## A', 'tarefa a', '', '## B', 'tarefa b'].join('\n'))
  const noTail = ['## A', 'tarefa a', '', '## B', 'tarefa b'].join('\n')
  assert.equal(moveBy(noTail, '## B', -1), ['## B', 'tarefa b', '', '## A', 'tarefa a'].join('\n'))
})

test('handles an empty section and keeps documents valid when sections touch', () => {
  const text = ['## A', '## B', 'tarefa b'].join('\n')
  const moved = moveBy(text, '## B', -1)
  assert.equal(moved, ['## B', 'tarefa b', '', '## A'].join('\n'))
  // The forward move added one blank between blocks that used to touch.
  assert.equal(moveBy(moved, '## B', 1), ['## A', '', '## B', 'tarefa b'].join('\n'))
})

test('H3 sections move among their own siblings across parent sections', () => {
  const text = [
    '# Notas',
    '',
    '## Primeira',
    '',
    '### Um-a',
    '',
    'texto a',
    '',
    '### Um-b',
    '',
    'texto b',
    '',
    '## Segunda',
    '',
    '### Dois-a',
    '',
    'texto c',
  ].join('\n')
  const moved = moveTo(text, '### Dois-a', 0)
  assert.equal(
    moved,
    [
      '# Notas',
      '',
      '## Primeira',
      '',
      '### Dois-a',
      '',
      'texto c',
      '',
      '### Um-a',
      '',
      'texto a',
      '',
      '### Um-b',
      '',
      'texto b',
      '',
      '## Segunda',
    ].join('\n'),
  )
  // '## Segunda' stays behind with its missing content at the very end.
  assert.match(moved, /texto b\n\n## Segunda$/)
  assert.equal(lineOf(moved, '### Dois-a'), 5)
})
