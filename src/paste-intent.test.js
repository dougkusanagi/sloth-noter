import test from 'node:test'
import assert from 'node:assert/strict'
import { createPasteIntentGuard } from './paste-intent.js'

const firstEditor = {},
  secondEditor = {}
function event(options = {}) {
  return {
    target: { closest: () => firstEditor },
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
    ...options,
  }
}

test('a populated paste requires a recent keyboard or context-menu action', () => {
  let time = 0
  const guard = createPasteIntentGuard(() => time)
  const unsolicited = event()
  assert.equal(guard.paste(unsolicited), true)
  assert.equal(unsolicited.prevented, true)
  assert.equal(unsolicited.stopped, true)
  for (const shortcut of [
    { key: 'v', ctrlKey: true },
    { key: 'V', metaKey: true, shiftKey: true },
    { key: 'Insert', shiftKey: true },
  ]) {
    guard.keyboard(event(shortcut))
    assert.equal(guard.paste(event()), false)
    assert.equal(guard.paste(event()), true)
  }
  guard.keyboard(event({ key: 'v', ctrlKey: true }))
  time += 1001
  assert.equal(guard.paste(event()), true)
  guard.contextMenu(event())
  time += 30_000
  assert.equal(guard.paste(event()), false)
  guard.contextMenu(event())
  time += 60_001
  assert.equal(guard.paste(event()), true)
})

test('focus changes, other keys, composition and another editor cannot reuse paste permission', () => {
  const guard = createPasteIntentGuard()
  for (const cancel of [
    () => guard.reset(),
    () => guard.keyboard(event({ key: 'a' })),
    () => guard.keyboard(event({ key: 'v', ctrlKey: true, altKey: true })),
    () => guard.keyboard(event({ key: 'v', ctrlKey: true, isComposing: true })),
    () => guard.keyboard(event({ key: 'v', ctrlKey: true, target: { closest: () => null } })),
  ]) {
    guard.contextMenu(event())
    cancel()
    assert.equal(guard.paste(event()), true)
  }
  guard.contextMenu(event())
  assert.equal(guard.paste(event({ target: { closest: () => secondEditor } })), true)
  assert.equal(guard.paste(event()), true)
})

test('beforeinput paste is allowed once, only after an authorized paste in the same editor', () => {
  let time = 0
  const guard = createPasteIntentGuard(() => time)
  const pasteInput = () => event({ inputType: 'insertFromPaste' })
  assert.equal(guard.beforeInput(pasteInput()), true)
  guard.keyboard(event({ key: 'v', ctrlKey: true }))
  assert.equal(guard.beforeInput(pasteInput()), true)
  guard.contextMenu(event())
  assert.equal(guard.paste(event()), false)
  assert.equal(guard.beforeInput(pasteInput()), false)
  assert.equal(guard.beforeInput(pasteInput()), true)
  guard.contextMenu(event())
  guard.paste(event())
  time += 1001
  assert.equal(guard.beforeInput(pasteInput()), true)
  assert.equal(guard.beforeInput(event({ inputType: 'insertText' })), false)
  assert.equal(
    guard.beforeInput(event({ inputType: 'insertFromPaste', target: { closest: () => null } })),
    false,
  )
})

test('an explicit async native paste authorizes only its own event during dispatch', () => {
  const guard = createPasteIntentGuard()
  const paste = event()
  const target = {
    dispatchEvent(nativeEvent) {
      // React wraps the native clipboard event.
      return !guard.paste(event({ nativeEvent }))
    },
  }
  assert.equal(guard.dispatchPaste(target, paste), true)
  assert.equal(guard.paste(paste), true)
  assert.equal(guard.paste(event()), true)
})

test('paste into other form fields is left to the browser without authorizing note edits', () => {
  const guard = createPasteIntentGuard()
  const field = event({ target: { closest: () => null } })
  assert.equal(guard.paste(field), false)
  assert.equal(field.prevented, false)
  assert.equal(guard.paste(event()), true)
})
