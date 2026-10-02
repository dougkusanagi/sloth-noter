import test from 'node:test'
import assert from 'node:assert/strict'
import { appShortcut } from './shortcuts.js'
test('app shortcuts respect modifiers and composition', () => {
  assert.equal(appShortcut({ key: 'I', ctrlKey: true, shiftKey: true }), 'images')
  assert.equal(appShortcut({ key: '2', metaKey: true, altKey: true }), 'source')
  assert.equal(appShortcut({ key: '?', ctrlKey: true, shiftKey: true }), 'shortcuts')
  assert.equal(appShortcut({ key: 'r', ctrlKey: true }), null)
  assert.equal(appShortcut({ key: 't', ctrlKey: true, isComposing: true }), null)
})
