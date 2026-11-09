import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMobileBack } from './mobile/back.js'
import { initialNavigation, navigate } from './mobile/nav-stack.js'

test('Android back closes layers, then keyboard, then screens and waits for a successful save before exit', async () => {
  let state = navigate(initialNavigation(), { type: 'push', route: { name: 'note', id: 'n1' } })
  state = navigate(state, { type: 'layer', route: { name: 'sheet' } })
  let keyboard = true,
    finished = 0,
    release
  const handle = createMobileBack({
    getState: () => state,
    keyboardOpen: () => keyboard,
    back: () => {
      state = navigate(state, { type: 'back' })
    },
    hideKeyboard: () => {
      keyboard = false
    },
    flush: () =>
      new Promise((resolve) => {
        release = resolve
      }),
    finish: () => finished++,
  })
  handle()
  assert.equal(state.layers.length, 0)
  handle()
  assert.equal(keyboard, false)
  handle()
  assert.equal(state.screens.length, 1)
  handle()
  handle()
  await Promise.resolve()
  assert.equal(finished, 0)
  release(null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(finished, 1)
})

test('Android back keeps the app open when saving fails', async () => {
  let finished = false
  const handle = createMobileBack({
    getState: initialNavigation,
    keyboardOpen: () => false,
    back() {},
    hideKeyboard() {},
    flush: async () => 'disk unavailable',
    finish: () => {
      finished = true
    },
  })
  handle()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(finished, false)
})
