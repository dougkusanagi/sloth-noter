import test from 'node:test'
import assert from 'node:assert/strict'
import { wrapSelection } from './wrap-selection.js'

test('wraps selected text with matching delimiters and preserves its selection', () => {
  for (const [key, closing] of [['(', ')'], ['[', ']'], ['{', '}'], ['"', '"'], ["'", "'"], ['`', '`']]) {
    const result = wrapSelection('before teste after', 7, 12, key)
    assert.deepEqual(result, { insert: `${key}teste${closing}`, from: 8, to: 13 })
  }
})

test('leaves empty selections and ordinary typing alone', () => {
  assert.equal(wrapSelection('teste', 0, 0, '('), null)
  assert.equal(wrapSelection('teste', 0, 5, 'a'), null)
})
