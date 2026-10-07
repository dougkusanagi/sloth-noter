import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyLine, inlineSyntax } from './live-markdown.js'

test('classifies block syntax and fenced code without altering text', () => {
  assert.deepEqual(classifyLine('# Título', false), { kind: 'h1', prefix: 2, nextFence: false })
  assert.deepEqual(classifyLine('> citação', false), { kind: 'quote', prefix: 2, nextFence: false })
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
