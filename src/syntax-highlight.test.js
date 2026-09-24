import test from 'node:test'
import assert from 'node:assert/strict'
import { codeTokens, syntaxRanges } from './syntax-highlight.js'

test('highlights JavaScript and keeps source positions intact', () => {
  const source = 'const nota = "olá"'
  const result = syntaxRanges(codeTokens(source, 'js'))
  assert.equal(result.end, source.length)
  assert.ok(result.ranges.some(range => range.types.includes('keyword') && source.slice(range.from, range.to) === 'const'))
  assert.ok(result.ranges.some(range => range.types.includes('string') && source.slice(range.from, range.to) === '"olá"'))
})

test('unknown languages remain readable as plain code', () => {
  assert.deepEqual(codeTokens('abc', 'unknown-language'), ['abc'])
})
