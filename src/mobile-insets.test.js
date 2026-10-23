import assert from 'node:assert/strict'
import { test } from 'node:test'
import { imeFromViewport, keyboardState } from './mobile/insets.js'

test('keyboard height is the part of the window the visual viewport does not cover', () => {
  assert.equal(imeFromViewport({ innerHeight: 800, viewport: { height: 500, offsetTop: 0 } }), 300)
  assert.equal(imeFromViewport({ innerHeight: 800, viewport: { height: 500, offsetTop: 20 } }), 280)
})

test('keyboard height is zero without a visual viewport or when nothing covers the window', () => {
  assert.equal(imeFromViewport({ innerHeight: 800, viewport: null }), 0)
  assert.equal(imeFromViewport({ innerHeight: 800, viewport: { height: 800, offsetTop: 0 } }), 0)
  assert.equal(imeFromViewport({ innerHeight: 800, viewport: { height: 820, offsetTop: 0 } }), 0)
})

test('keyboard state is open only when the keyboard takes space', () => {
  assert.equal(keyboardState(300), 'open')
  assert.equal(keyboardState(0), 'closed')
})
