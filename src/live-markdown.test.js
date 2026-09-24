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
  assert.deepEqual(inlineSyntax('**bold** *em* `code` [ok](https://example.com)').map(item => item.kind), ['strong', 'em', 'code', 'link'])
  assert.deepEqual(inlineSyntax('[bad](javascript:alert(1))'), [])
  assert.deepEqual(inlineSyntax('#tag `#literal` palavra#nao').map(item => item.kind), ['tag', 'code'])
})
