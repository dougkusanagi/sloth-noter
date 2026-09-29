import test from 'node:test'
import assert from 'node:assert/strict'
import { codeTokens, syntaxRanges } from './syntax-highlight.js'

test('highlights JavaScript and keeps source positions intact', () => {
  const source = 'const nota = "olá"'
  const result = syntaxRanges(codeTokens(source, 'js'))
  assert.equal(result.end, source.length)
  assert.ok(
    result.ranges.some(
      (range) => range.types.includes('keyword') && source.slice(range.from, range.to) === 'const',
    ),
  )
  assert.ok(
    result.ranges.some(
      (range) => range.types.includes('string') && source.slice(range.from, range.to) === '"olá"',
    ),
  )
})

test('unknown languages remain readable as plain code', () => {
  assert.deepEqual(codeTokens('abc', 'unknown-language'), ['abc'])
})

test('highlights PHP and common fence language aliases', () => {
  const source = '<?php echo "Testando"; ?>'
  const result = syntaxRanges(codeTokens(source, 'PHP'))
  assert.equal(result.end, source.length)
  assert.ok(
    result.ranges.some(
      (range) => range.types.includes('keyword') && source.slice(range.from, range.to) === 'echo',
    ),
  )
  assert.ok(
    result.ranges.some(
      (range) =>
        range.types.includes('string') && source.slice(range.from, range.to) === '"Testando"',
    ),
  )

  const samples = {
    html: '<p>test</p>',
    css: 'p { color: red; }',
    sql: 'SELECT name FROM notes;',
    yml: 'name: test',
    java: 'class Note {}',
    cpp: 'int main() {}',
    csharp: 'public class Note {}',
    go: 'func main() {}',
    rust: 'fn main() {}',
    ruby: 'puts "test"',
    jsx: '<Note />',
    tsx: '<Note />',
  }
  for (const [language, sample] of Object.entries(samples)) {
    assert.notDeepEqual(codeTokens(sample, language), [sample], language)
  }
})
