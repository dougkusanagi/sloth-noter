import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createMobileBack, backEnabled } from './mobile/back.js'
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

test('predictive back is enabled only while a layer, screen or unsaved note needs it', () => {
  const root = initialNavigation()
  assert.equal(backEnabled(root), false)
  assert.equal(backEnabled(root, { saving: true }), true)
  assert.equal(backEnabled(root, { error: 'disk unavailable' }), true)
  const detail = navigate(root, { type: 'push', route: { name: 'note', id: 'n1' } })
  assert.equal(backEnabled(detail), true)
  assert.equal(backEnabled(navigate(detail, { type: 'layer', route: { name: 'sheet' } })), true)
  assert.equal(backEnabled(root, { saving: false, error: null }), false)
})

test('Android back warns once while waiting for a pending save, then exits', async () => {
  let finished = 0,
    pending = 0,
    failed = 0,
    release
  const handle = createMobileBack({
    getState: initialNavigation,
    keyboardOpen: () => false,
    pending: () => true,
    back() {},
    hideKeyboard() {},
    flush: () =>
      new Promise((resolve) => {
        release = resolve
      }),
    finish: () => finished++,
    onPending: () => pending++,
    onFailed: () => failed++,
  })
  handle()
  handle()
  assert.equal(pending, 1)
  await Promise.resolve()
  release(null)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(finished, 1)
  assert.equal(failed, 0)
})

test('Android back warns and does not exit when the final save fails', async () => {
  let finished = 0,
    failed = 0
  const handle = createMobileBack({
    getState: initialNavigation,
    keyboardOpen: () => false,
    pending: () => true,
    back() {},
    hideKeyboard() {},
    flush: async () => 'no space',
    finish: () => finished++,
    onPending() {},
    onFailed: () => failed++,
  })
  handle()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(failed, 1)
  assert.equal(finished, 0)
})
