import test from 'node:test'
import assert from 'node:assert/strict'
import { SHORTCUTS, appShortcut } from './shortcuts.js'
import { formatShortcut, shortcutEdit } from './editor-shortcuts.js'
test('app shortcuts respect modifiers and composition', () => {
  assert.equal(appShortcut({ key: 'T', ctrlKey: true, shiftKey: true }), 'reopenTab')
  assert.equal(appShortcut({ key: 'PageUp', ctrlKey: true }), 'previousTab')
  assert.equal(appShortcut({ key: 'PageDown', metaKey: true }), 'nextTab')
  assert.equal(appShortcut({ key: 'Tab', ctrlKey: true }), 'nextTab')
  assert.equal(appShortcut({ key: 'Tab', ctrlKey: true, shiftKey: true }), 'previousTab')
  assert.equal(appShortcut({ key: 'Tab' }), null)
  assert.equal(appShortcut({ key: 'Tab', ctrlKey: true, altKey: true }), null)
  assert.equal(appShortcut({ key: 'Tab', ctrlKey: true, isComposing: true }), null)
  assert.equal(appShortcut({ key: 'PageDown', ctrlKey: true, shiftKey: true }), null)
  assert.equal(appShortcut({ key: 'L', ctrlKey: true, shiftKey: true }), 'images')
  assert.equal(appShortcut({ key: 'F2' }), 'rename')
  assert.equal(appShortcut({ key: 'F2', ctrlKey: true }), null)
  assert.equal(appShortcut({ key: '2', metaKey: true, altKey: true }), 'source')
  assert.equal(appShortcut({ key: '?', ctrlKey: true, shiftKey: true }), 'shortcuts')
  assert.equal(appShortcut({ key: '\\', ctrlKey: true }), 'sidebar')
  assert.equal(appShortcut({ key: 'P', ctrlKey: true, shiftKey: true }), 'commands')
  assert.equal(appShortcut({ key: 'o', ctrlKey: true }), 'import')
  assert.equal(appShortcut({ key: ',', metaKey: true }), 'settings')
  for (const key of ['b', 'i', 'k'])
    assert.equal(appShortcut({ key, ctrlKey: true }), null, `Ctrl+${key} belongs to the editor`)
  assert.equal(appShortcut({ key: 'r', ctrlKey: true }), null)
  assert.equal(appShortcut({ key: 'h', ctrlKey: true }), 'replaceInNote')
  assert.equal(appShortcut({ key: 't', ctrlKey: true, isComposing: true }), null)
})

// Combinations owned by the browser or webview: developer tools, hard reload, view source,
// downloads and bookmarks. Ctrl+H intentionally opens replacement, as in VS Code.
const RESERVED = ['Shift+I', 'Alt+I', 'Shift+R', 'Shift+C', 'Shift+J', 'R', 'U', 'J', 'D']

test('no shortcut collides with a combination the browser or webview owns', () => {
  assert.deepEqual(
    SHORTCUTS.map(([keys]) => keys).filter((keys) => RESERVED.includes(keys)),
    [],
  )
  assert.equal(appShortcut({ key: 'I', ctrlKey: true, shiftKey: true }), null)
  assert.equal(appShortcut({ key: 'i', ctrlKey: true, altKey: true }), null)
  assert.equal(appShortcut({ key: 'R', ctrlKey: true, shiftKey: true }), null)
})

test('number shortcuts address tabs without colliding with editor mode shortcuts', () => {
  for (let number = 1; number <= 9; number++)
    assert.equal(appShortcut({ key: String(number), ctrlKey: true }), `tab${number}`)
  assert.equal(appShortcut({ key: '2', ctrlKey: true, altKey: true }), 'source')
  assert.equal(appShortcut({ key: '2', ctrlKey: true, shiftKey: true }), null)
  assert.equal(appShortcut({ key: '2', ctrlKey: true, isComposing: true }), null)
})

test('focus mode uses Ctrl+Alt+F and Ctrl+Shift+F searches every note, as in VS Code', () => {
  assert.equal(appShortcut({ key: 'f', ctrlKey: true, altKey: true }), 'focus')
  assert.equal(appShortcut({ key: 'f', metaKey: true, altKey: true }), 'focus')
  assert.equal(appShortcut({ key: 'F', ctrlKey: true, shiftKey: true }), 'searchAllNotes')
  assert.equal(appShortcut({ key: 'f', ctrlKey: true }), 'findInNote')
})

test('formatting shortcuts follow other Markdown editors', () => {
  const key = (event) => formatShortcut({ ctrlKey: true, ...event })
  assert.equal(key({ key: 'b' }), 'bold')
  assert.equal(key({ key: 'i' }), 'italic')
  assert.equal(key({ key: 'k' }), 'link')
  assert.equal(key({ key: '`' }), 'code')
  assert.equal(key({ key: 'X', shiftKey: true }), 'strike')
  assert.equal(key({ key: '*', code: 'Digit8', shiftKey: true }), 'list')
  assert.equal(key({ key: '>', code: 'Period', shiftKey: true }), 'quote')
  assert.equal(key({ key: 'b', altKey: true }), null)
  assert.equal(formatShortcut({ key: 'b' }), null)
  assert.equal(key({ key: 'b', isComposing: true }), null)
})

test('formatting shortcuts edit selections and empty cursors', () => {
  const apply = (text, from, to, action) => {
    const edit = shortcutEdit(text, from, to, action)
    return (
      edit && [text.slice(0, edit.from) + edit.insert + text.slice(edit.to), edit.selectionFrom]
    )
  }
  assert.deepEqual(apply('abc def', 0, 3, 'bold'), ['**abc** def', 2])
  assert.deepEqual(apply('abc def', 3, 3, 'bold'), ['abc**** def', 5])
  assert.deepEqual(apply('abc', 0, 3, 'strike'), ['~~abc~~', 2])
  assert.deepEqual(apply('abc', 0, 3, 'link'), ['[abc]()', 6])
  assert.deepEqual(apply('abc', 1, 1, 'link'), ['a[]()bc', 2])
  assert.deepEqual(apply('abc', 1, 1, 'list'), ['- abc', 3])
})
