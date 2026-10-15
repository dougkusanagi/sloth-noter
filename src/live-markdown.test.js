import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyLine, inlineSyntax } from './live-markdown.js'

test('classifies block syntax and fenced code without altering text', () => {
  assert.deepEqual(classifyLine('# Título', false), { kind: 'h1', prefix: 2, nextFence: false })
  assert.deepEqual(classifyLine('> citação', false), {
    kind: 'quote',
    prefix: 2,
    depth: 1,
    nextFence: false,
  })
  assert.deepEqual(classifyLine('```js', false), { kind: 'fence', prefix: 5, nextFence: true })
  assert.deepEqual(classifyLine('**raw**', true), { kind: 'code', prefix: 0, nextFence: true })
})

test('finds inline styles while leaving unsafe links literal', () => {
  assert.deepEqual(
    inlineSyntax('**bold** *em* `code` [ok](https://example.com)').map((item) => item.kind),
    ['strong', 'em', 'code', 'link'],
  )
  assert.deepEqual(inlineSyntax('[bad](javascript:alert(1))'), [])
  assert.deepEqual(
    inlineSyntax('#tag `#literal` palavra#nao').map((item) => item.kind),
    ['tag', 'code'],
  )
  assert.deepEqual(
    inlineSyntax('normal *itálico* e **negrito**.').map((item) => [
      item.kind,
      item.start,
      item.end,
    ]),
    [
      ['em', 7, 16],
      ['strong', 19, 30],
    ],
  )
  assert.deepEqual(
    inlineSyntax('**forte *e suave***').map((item) => item.kind),
    ['strong', 'em'],
  )
})

test('automatic and bracketed links use their actual label ranges', () => {
  for (const [text, label] of [
    ['user@example.com', 'user@example.com'],
    ['https://example.com', 'https://example.com'],
    ['<https://example.com>', 'https://example.com'],
    ['[**name**](https://example.com)', '**name**'],
    ['[a \\] b](https://example.com)', 'a \\] b'],
  ]) {
    const link = inlineSyntax(text).find((token) => token.kind === 'link')
    assert.equal(text.slice(link.contentStart, link.contentEnd), label)
    assert.ok(link.start <= link.contentStart)
    assert.ok(link.contentStart <= link.contentEnd)
    assert.ok(link.contentEnd <= link.end)
  }
})

test('classifies every block kind of the live editor', () => {
  const kind = (text) => classifyLine(text, false).kind
  for (let level = 1; level <= 6; level++)
    assert.equal(kind(`${'#'.repeat(level)} Título`), `h${level}`)
  assert.equal(kind('####### sete'), 'paragraph')
  assert.equal(kind('#semespaço'), 'paragraph')
  for (const rule of ['---', '***', '___', '- - -'.replace(/ /g, '')])
    assert.equal(kind(rule), 'rule')
  for (const bullet of ['- a', '* a', '+ a', '  - aninhado']) assert.equal(kind(bullet), 'bullet')
  assert.equal(kind('1. um'), 'ordered')
  assert.equal(kind('| a | b |'), 'table')
  assert.equal(kind('| :-: | --: |'), 'table')
  assert.equal(kind('texto comum'), 'paragraph')
  assert.equal(kind('[^1]: nota'), 'paragraph')
  assert.equal(classifyLine('```', true).nextFence, false)
  assert.equal(classifyLine('```', false).nextFence, true)
})

test('quotes keep their marker, including empty and nested levels', () => {
  assert.deepEqual(classifyLine('> texto', false), {
    kind: 'quote',
    prefix: 2,
    depth: 1,
    nextFence: false,
  })
  assert.deepEqual(classifyLine('>', false), {
    kind: 'quote',
    prefix: 1,
    depth: 1,
    nextFence: false,
  })
  assert.deepEqual(classifyLine('> > aninhada', false), {
    kind: 'quote',
    prefix: 4,
    depth: 2,
    nextFence: false,
  })
  assert.deepEqual(classifyLine('>> aninhada', false), {
    kind: 'quote',
    prefix: 3,
    depth: 2,
    nextFence: false,
  })
})

test('backslash escapes are tokens that hide only the backslash', () => {
  const text = 'a \\*sem\\* b \\\\ c \\[x]'
  const escapes = inlineSyntax(text).filter((token) => token.kind === 'escape')
  assert.deepEqual(
    escapes.map((token) => text.slice(token.start, token.contentStart)),
    ['\\', '\\', '\\', '\\'],
  )
  assert.deepEqual(
    escapes.map((token) => text.slice(token.contentStart, token.contentEnd)),
    ['*', '*', '\\', '['],
  )
  assert.deepEqual(
    inlineSyntax('\\*não é itálico\\*').filter((token) => token.kind === 'em'),
    [],
  )
  assert.deepEqual(
    inlineSyntax('`\\*` literal').filter((token) => token.kind === 'escape'),
    [],
  )
})

test('every inline format reports its content range', () => {
  const cases = [
    ['**forte**', 'strong', 'forte'],
    ['*ênfase*', 'em', 'ênfase'],
    ['_ênfase_', 'em', 'ênfase'],
    ['~~riscado~~', 'strike', 'riscado'],
    ['`código`', 'code', 'código'],
    ['`` co`digo ``', 'code', ' co`digo '],
    ['[texto](https://example.com)', 'link', 'texto'],
    ['[texto](./nota.md)', 'link', 'texto'],
    ['[texto](#secao)', 'link', 'texto'],
    ['[mail](mailto:a@b.co)', 'link', 'mail'],
    ['texto[^1]', 'footnote', '1'],
    ['[[Nota]]', 'wiki', 'Nota'],
    ['[[Nota|rótulo]]', 'wiki', 'rótulo'],
    ['#ideia', 'tag', '#ideia'],
    ['#projeto/lista', 'tag', '#projeto/lista'],
  ]
  for (const [text, kind, content] of cases) {
    const token = inlineSyntax(text, '[^1]: nota').find((item) => item.kind === kind)
    assert.ok(token, `${text} → ${kind}`)
    assert.equal(text.slice(token.contentStart, token.contentEnd), content, text)
  }
  const bold = inlineSyntax('***ambos***').map((token) => token.kind)
  assert.ok(bold.includes('strong') && bold.includes('em'))
})

test('wiki links, tags and escapes stay literal inside code and links', () => {
  assert.deepEqual(
    inlineSyntax('`[[Nota]] #tag`').map((token) => token.kind),
    ['code'],
  )
  assert.deepEqual(
    inlineSyntax('[#tag](https://example.com)').map((token) => token.kind),
    ['link'],
  )
  assert.deepEqual(
    inlineSyntax('\\[[Nota]]').filter((token) => token.kind === 'wiki'),
    [],
  )
  for (const unsafe of [
    '[x](javascript:alert(1))',
    '[x](data:text/html;base64,AAAA)',
    '[x](file:///etc/passwd)',
  ])
    assert.deepEqual(inlineSyntax(unsafe), [], unsafe)
})
