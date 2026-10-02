import test from 'node:test'
import assert from 'node:assert/strict'
import { SHORTCUTS, appShortcut } from './shortcuts.js'
test('app shortcuts respect modifiers and composition', () => {
  assert.equal(appShortcut({ key: 'L', ctrlKey: true, shiftKey: true }), 'images')
  assert.equal(appShortcut({ key: 'F2' }), 'rename')
  assert.equal(appShortcut({ key: 'F2', ctrlKey: true }), null)
  assert.equal(appShortcut({ key: '2', metaKey: true, altKey: true }), 'source')
  assert.equal(appShortcut({ key: '?', ctrlKey: true, shiftKey: true }), 'shortcuts')
  assert.equal(appShortcut({ key: 'k', ctrlKey: true }), 'commands')
  assert.equal(appShortcut({ key: ',', metaKey: true }), 'settings')
  assert.equal(appShortcut({ key: 'k', ctrlKey: true, shiftKey: true }), null)
  assert.equal(appShortcut({ key: 'r', ctrlKey: true }), null)
  assert.equal(appShortcut({ key: 't', ctrlKey: true, isComposing: true }), null)
})

// Combinations owned by the browser or webview: developer tools, hard reload, view source,
// downloads, history and bookmarks. The app must never bind them.
const RESERVED = ['Shift+I', 'Alt+I', 'Shift+R', 'Shift+C', 'Shift+J', 'R', 'U', 'H', 'J', 'D']

test('no shortcut collides with a combination the browser or webview owns', () => {
  assert.deepEqual(
    SHORTCUTS.map(([keys]) => keys).filter((keys) => RESERVED.includes(keys)),
    [],
  )
  assert.equal(appShortcut({ key: 'I', ctrlKey: true, shiftKey: true }), null)
  assert.equal(appShortcut({ key: 'i', ctrlKey: true, altKey: true }), null)
  assert.equal(appShortcut({ key: 'R', ctrlKey: true, shiftKey: true }), null)
})
