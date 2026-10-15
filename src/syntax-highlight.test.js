import test from 'node:test'
import assert from 'node:assert/strict'
import { codeLanguageName, codeTokens, syntaxRanges } from './syntax-highlight.js'

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

test('every bundled language highlights its code and keeps positions intact', () => {
  const samples = {
    javascript: 'const a = "x"',
    js: 'const a = "x"',
    jsx: 'const a = <b>{x}</b>',
    ts: 'const a: string = "x"',
    tsx: 'const a: string = <b>{x}</b>',
    python: 'def f(x):\n    return "x"',
    py: 'def f(x):\n    return "x"',
    bash: 'echo "x" # nota',
    sh: 'echo "x" # nota',
    json: '{ "a": true }',
    html: '<p class="a">x</p>',
    css: '.a { color: #fff; }',
    sql: "SELECT a FROM b WHERE c = 'x';",
    yaml: 'chave: "valor"',
    yml: 'chave: "valor"',
    md: '# Título\n**forte**',
    php: '<?php echo "x"; ?>',
    java: 'class A { String b = "x"; }',
    c: 'int main() { return 0; }',
    cpp: 'int main() { return 0; }',
    csharp: 'class A { string b = "x"; }',
    go: 'func main() { x := "a" }',
    rust: 'fn main() { let x = "a"; }',
    ruby: 'def f; "x"; end',
  }
  for (const [language, source] of Object.entries(samples)) {
    const tokens = codeTokens(source, language)
    assert.ok(
      tokens.some((token) => typeof token !== 'string'),
      `${language} is highlighted`,
    )
    assert.equal(syntaxRanges(tokens).end, source.length, `${language} keeps positions`)
  }
})

test('language labels follow fence aliases', () => {
  assert.equal(codeLanguageName('js'), 'javascript')
  assert.equal(codeLanguageName('PY title="x"'), 'python')
  assert.equal(codeLanguageName('md'), 'markdown')
  assert.equal(codeLanguageName('html'), 'html')
  assert.equal(codeLanguageName('text'), '')
  assert.equal(codeLanguageName(''), '')
})
