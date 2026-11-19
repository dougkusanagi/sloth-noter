import test from 'node:test'
import assert from 'node:assert/strict'
import { SHORTCUTS, appShortcut } from './shortcuts.js'
import {
  SHORTCUT_ACTIONS,
  keysFor,
  keysFromEvent,
  setShortcutOverrides,
  shortcutConflict,
} from './shortcut-registry.js'
import { blockKeys, blockShortcut, formatShortcut, shortcutEdit } from './editor-shortcuts.js'

test('block shortcuts respect composition and modifiers and use physical shifted keys', () => {
  const blocks = SHORTCUT_ACTIONS.filter((item) => item.scope === 'block').map((item) => [
    item.keys[0],
    item.label,
    item.action,
  ])
  for (const [keys, , action] of blocks) {
    const key = keys.slice('Shift+'.length)
    const event = {
      ctrlKey: true,
      shiftKey: true,
      key: key === '`' ? '~' : '!@#$%^&'[Number(key) - 1],
      code: key === '`' ? 'Backquote' : `Digit${key}`,
    }
    assert.equal(blockShortcut(event, false), action)
    assert.equal(blockShortcut({ ...event, ctrlKey: false, metaKey: true }, false), action)
    assert.equal(blockShortcut({ ...event, ctrlKey: false }), null)
    assert.equal(blockShortcut({ ...event, shiftKey: false }), null)
    assert.equal(blockShortcut({ ...event, altKey: true }), null)
    assert.equal(blockShortcut({ ...event, isComposing: true }), null)
    assert.equal(appShortcut(event), null)
    assert.equal(blockKeys(action, false), keys)
    assert.equal(blockKeys(action, true), `Alt+${keys}`)
    assert.equal(blockShortcut({ ...event, ctrlKey: false, metaKey: true }, true), null)
    assert.equal(
      blockShortcut({ ...event, ctrlKey: false, metaKey: true, altKey: true }, true),
      action,
    )
    assert.equal(SHORTCUTS.filter(([shortcut]) => shortcut === blockKeys(action)).length, 1)
  }
  assert.equal(blockShortcut({ ctrlKey: true, shiftKey: true, key: 'T', code: 'KeyT' }), null)
})
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
  assert.equal(appShortcut({ key: 'b', ctrlKey: true, altKey: true }), 'sidebar')
  assert.equal(appShortcut({ key: 'B', metaKey: true, altKey: true }), 'sidebar')
  assert.equal(appShortcut({ key: '∫', code: 'KeyB', metaKey: true, altKey: true }), 'sidebar')
  assert.equal(appShortcut({ key: 'b', ctrlKey: true, altKey: true, shiftKey: true }), null)
  assert.equal(appShortcut({ key: '\\', ctrlKey: true }), null)
  assert.equal(appShortcut({ key: 'P', ctrlKey: true, shiftKey: true }), 'commands')
  assert.equal(appShortcut({ key: 'o', ctrlKey: true }), 'import')
  assert.equal(appShortcut({ key: ',', metaKey: true }), 'settings')
  for (const key of ['b', 'i', 'k'])
    assert.equal(appShortcut({ key, ctrlKey: true }), null, `Ctrl+${key} belongs to the editor`)
  assert.equal(appShortcut({ key: 'r', ctrlKey: true }), null)
  assert.equal(appShortcut({ key: 'h', ctrlKey: true }), 'replaceInNote')
  assert.equal(appShortcut({ key: 't', ctrlKey: true, isComposing: true }), null)
})

test('F10 toggles the main menu without taking the tab context menu shortcut', () => {
  assert.equal(appShortcut({ key: 'F10' }), 'mainMenu')
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey', 'isComposing'])
    assert.equal(appShortcut({ key: 'F10', [modifier]: true }), null)
  assert.ok(SHORTCUTS.some(([keys, label]) => keys === 'F10' && label === 'menu.main'))
  assert.ok(SHORTCUTS.some(([keys, label]) => keys === 'Alt+B' && label === 'sidebar.toggle'))
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

test('bold and italic combine and unwind without piling up asterisks', () => {
  let text = 'texto',
    from = 0,
    to = 5
  const steps = []
  for (const action of ['bold', 'italic', 'italic', 'bold', 'italic', 'bold', 'italic', 'bold']) {
    const edit = shortcutEdit(text, from, to, action)
    text = text.slice(0, edit.from) + edit.insert + text.slice(edit.to)
    ;[from, to] = [edit.selectionFrom, edit.selectionTo]
    steps.push(text)
  }
  assert.deepEqual(steps, [
    '**texto**',
    '***texto***',
    '**texto**',
    'texto',
    '*texto*',
    '***texto***',
    '**texto**',
    'texto',
  ])
  // Selecting the markers too behaves the same as selecting only the text.
  const edit = shortcutEdit('**texto**', 0, 9, 'italic')
  assert.equal(edit.insert, '***texto***')
})

test('the outline shortcut uses the shared app action', () => {
  assert.equal(appShortcut({ key: 't', code: 'KeyT', ctrlKey: true, altKey: true }), 'outline')
  assert.equal(appShortcut({ key: 't', code: 'KeyT', metaKey: true, altKey: true }), 'outline')
  assert.equal(
    appShortcut({ key: 't', code: 'KeyT', ctrlKey: true, altKey: true, shiftKey: true }),
    null,
  )
})

test('changed shortcuts replace the defaults and can be restored', () => {
  setShortcutOverrides({ newNote: 'Alt+N', blockMenu: 'Shift+K' })
  try {
    assert.equal(appShortcut({ key: 'n', code: 'KeyN', ctrlKey: true, altKey: true }), 'newNote')
    assert.equal(appShortcut({ key: 't', code: 'KeyT', ctrlKey: true }), null)
    assert.equal(
      formatShortcut({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }),
      'blockMenu',
    )
    assert.equal(formatShortcut({ key: '/', code: 'Slash', ctrlKey: true }), null)
    assert.deepEqual(keysFor('newNote'), ['Alt+N'])
  } finally {
    setShortcutOverrides({})
  }
  assert.equal(appShortcut({ key: 't', code: 'KeyT', ctrlKey: true }), 'newNote')
  // The tab number shortcuts are fixed.
  setShortcutOverrides({ tab1: 'Alt+9' })
  assert.deepEqual(keysFor('tab1'), ['1'])
  setShortcutOverrides({})
})

test('the block actions menu has its own shortcut, Ctrl+/', () => {
  assert.equal(formatShortcut({ key: '/', code: 'Slash', ctrlKey: true }), 'blockMenu')
  // On ABNT keyboards the / key has another code.
  assert.equal(formatShortcut({ key: '/', code: 'IntlRo', ctrlKey: true }), 'blockMenu')
  assert.equal(formatShortcut({ key: '?', code: 'Slash', ctrlKey: true, shiftKey: true }), null)
  assert.equal(appShortcut({ key: '?', code: 'Slash', ctrlKey: true, shiftKey: true }), 'shortcuts')
})

test('recording a shortcut reads the physical key and needs a modifier', () => {
  assert.equal(keysFromEvent({ key: 'n', code: 'KeyN', ctrlKey: true, altKey: true }), 'Alt+N')
  assert.equal(keysFromEvent({ key: 'N', code: 'KeyN', ctrlKey: true, shiftKey: true }), 'Shift+N')
  assert.equal(keysFromEvent({ key: 'F4', code: 'F4' }), 'F4')
  assert.equal(keysFromEvent({ key: 'n', code: 'KeyN' }), null)
  assert.equal(keysFromEvent({ key: 'Control', code: 'ControlLeft', ctrlKey: true }), null)
})

test('a shortcut already in use is reported as a conflict', () => {
  assert.equal(shortcutConflict('newNote', 'P').id, 'findNote')
  assert.equal(shortcutConflict('newNote', 'B').id, 'bold')
  assert.equal(shortcutConflict('newNote', 'Alt+N'), null)
  assert.equal(shortcutConflict('newNote', 'T'), null)
})
