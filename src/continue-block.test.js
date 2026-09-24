import test from 'node:test'
import assert from 'node:assert/strict'
import { continueBlock } from './continue-block.js'

test('continues unordered and ordered lists and quotes', () => {
  assert.deepEqual(continueBlock('- item', 6), { from: 6, to: 6, insert: '\n- ', cursor: 9 })
  assert.deepEqual(continueBlock('9. item', 7), { from: 7, to: 7, insert: '\n10. ', cursor: 12 })
  assert.deepEqual(continueBlock('> texto', 7), { from: 7, to: 7, insert: '\n> ', cursor: 10 })
})

test('empty item ends a list or quote', () => {
  assert.deepEqual(continueBlock('- item\n- ', 9), { from: 7, to: 9, insert: '', cursor: 7 })
  assert.deepEqual(continueBlock('> ', 2), { from: 0, to: 2, insert: '', cursor: 0 })
})

test('leaves middle of lines and fenced code alone', () => {
  assert.equal(continueBlock('- item', 3), null)
  assert.equal(continueBlock('```\n- item\n```', 10), null)
})
