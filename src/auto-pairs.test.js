import test from 'node:test'
import assert from 'node:assert/strict'
import { EditorState } from '@codemirror/state'
import { committedBacktick, pairInput } from './editor/auto-pairs.js'

const state = (doc) => EditorState.create({ doc })

test('literal backticks create inline pairs and a multiline fence', () => {
  assert.deepEqual(pairInput(state(''), 0, 0, '`'), {
    from: 0,
    to: 0,
    insert: '``',
    anchor: 1,
    head: 1,
  })
  assert.equal(pairInput(state('``'), 1, 1, '`'), null)
  assert.deepEqual(pairInput(state('``'), 2, 2, '`'), {
    from: 2,
    to: 2,
    insert: '`\n\n```',
    anchor: 4,
  })
})

test('composed accented characters are left to the editor', () => {
  assert.equal(pairInput(state(''), 0, 0, 'à'), null)
  assert.equal(pairInput(state(''), 0, 0, 'a\u0300'), null)
})

test('a committed dead-key backtick is paired, but an accented vowel is not', () => {
  const start = state('')
  const committed = EditorState.create({ doc: '`', selection: { anchor: 1 } })
  assert.deepEqual(committedBacktick(start, committed, 0, 0), {
    from: 0,
    to: 1,
    insert: '``',
    anchor: 1,
    head: 1,
  })
  const accented = EditorState.create({ doc: 'à', selection: { anchor: 1 } })
  assert.equal(committedBacktick(start, accented, 0, 0), null)
})
