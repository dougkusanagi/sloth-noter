import test from 'node:test'
import assert from 'node:assert/strict'
import { createMiddleClickPasteGuard } from './middle-click-paste.js'

function event(type, button, link = false) {
  return {
    type,
    button,
    prevented: false,
    stopped: false,
    target: { closest: (selector) => (selector === 'a[href]' ? link : true) },
    preventDefault() {
      this.prevented = true
    },
    stopPropagation() {
      this.stopped = true
    },
  }
}

test('middle click blocks native selection paste and empty-paste clipboard fallback', () => {
  const guard = createMiddleClickPasteGuard()
  for (const type of ['mousedown', 'mouseup', 'auxclick']) {
    const mouse = event(type, 1)
    guard.mouse(mouse)
    assert.equal(mouse.prevented, true)
    assert.equal(mouse.stopped, true)
  }
  const paste = event('paste')
  assert.equal(guard.paste(paste), true)
  assert.equal(paste.prevented, true)
})

test('keyboard paste, context menu paste and middle-click links remain available', () => {
  const guard = createMiddleClickPasteGuard()
  guard.mouse(event('mousedown', 1))
  guard.keyboard()
  assert.equal(guard.paste(event('paste')), false)
  guard.mouse(event('mousedown', 1))
  guard.mouse(event('mousedown', 2))
  assert.equal(guard.paste(event('paste')), false)
  const link = event('mousedown', 1, true)
  guard.mouse(link)
  assert.equal(link.prevented, false)
  assert.equal(guard.paste(event('paste')), false)
})
