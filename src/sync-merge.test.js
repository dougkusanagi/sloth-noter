import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeLines } from './sync/merge.js'

const text = (result) => {
  assert.equal(result.conflict, false)
  return result.chunks.flatMap((chunk) => chunk.lines).join('\n')
}

test('independent edits on different lines are combined', () => {
  const base = '# Lista\n\na\nb\nc\nd'
  assert.equal(
    text(mergeLines(base, '# Lista\n\nA\nb\nc\nd', '# Lista\n\na\nb\nc\nD\ne')),
    '# Lista\n\nA\nb\nc\nD\ne',
  )
})

test('one side unchanged takes the other, equal changes merge once', () => {
  assert.equal(text(mergeLines('a\nb', 'a\nb', 'a\nx\nb')), 'a\nx\nb')
  assert.equal(text(mergeLines('a\nb', 'a\nb\nc', 'a\nb\nc')), 'a\nb\nc')
  assert.equal(text(mergeLines('a\nb\nc', 'a\nc', 'a\nb\nc')), 'a\nc')
  assert.equal(text(mergeLines('', 'novo', '')), 'novo')
})

test('overlapping edits keep both versions as a conflict', () => {
  const result = mergeLines('a\nb\nc', 'a\nnosso\nc', 'a\ndeles\nc')
  assert.equal(result.conflict, true)
  assert.deepEqual(result.chunks, [
    { lines: ['a'] },
    { conflict: { base: ['b'], ours: ['nosso'], theirs: ['deles'] } },
    { lines: ['c'] },
  ])
})

test('different lines added at the same place conflict instead of guessing an order', () => {
  const result = mergeLines('a\nb', 'a\nb\nx', 'a\nb\ny')
  assert.deepEqual(result.chunks.at(-1), { conflict: { base: [], ours: ['x'], theirs: ['y'] } })
})

test('a deleted line against an edited line is a conflict, nothing is lost', () => {
  const result = mergeLines('a\nb\nc', 'a\nc', 'a\nB\nc')
  assert.equal(result.conflict, true)
  const all = JSON.stringify(result.chunks)
  assert.ok(all.includes('"B"'))
})

test('huge differing middles fall back to one conflict that keeps both texts', () => {
  const big = (prefix) => Array.from({ length: 2500 }, (_, i) => `${prefix}${i}`).join('\n')
  const result = mergeLines(
    `top\n${big('b')}\nend`,
    `top\n${big('o')}\nend`,
    `top\n${big('t')}\nend`,
  )
  assert.equal(result.chunks.length, 3)
  assert.equal(result.chunks[1].conflict.ours.length, 2500)
  assert.equal(result.chunks[1].conflict.theirs.length, 2500)
})
