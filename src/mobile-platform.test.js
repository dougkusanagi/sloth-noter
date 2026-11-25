import test from 'node:test'
import assert from 'node:assert/strict'
import { runNoteTransition } from './mobile/view-transition.js'
import { triggerHaptic } from './mobile/haptics.js'

test('B1: runNoteTransition uses View Transitions API when available and motion is not reduced', () => {
  let ran = 0
  let transitioned = 0
  const doc = {
    startViewTransition(cb) {
      transitioned += 1
      cb()
    },
  }
  const win = { matchMedia: () => ({ matches: false }) }
  assert.equal(
    runNoteTransition(
      () => {
        ran += 1
      },
      { doc, win },
    ),
    true,
  )
  assert.equal(ran, 1)
  assert.equal(transitioned, 1)
})

test('B1: runNoteTransition skips animation when prefers-reduced-motion or API is missing', () => {
  let ran = 0
  let transitioned = 0
  const doc = {
    startViewTransition(cb) {
      transitioned += 1
      cb()
    },
  }
  const reduced = { matchMedia: () => ({ matches: true }) }
  assert.equal(
    runNoteTransition(
      () => {
        ran += 1
      },
      { doc, win: reduced },
    ),
    false,
  )
  assert.equal(ran, 1)
  assert.equal(transitioned, 0)

  assert.equal(
    runNoteTransition(
      () => {
        ran += 1
      },
      { doc: {}, win: { matchMedia: () => ({ matches: false }) } },
    ),
    false,
  )
  assert.equal(ran, 2)
})

test('B2: triggerHaptic prefers SlothSystem.haptic and falls back to navigator.vibrate', () => {
  const calls = []
  const system = { haptic: (kind) => calls.push(kind) }
  assert.equal(triggerHaptic('threshold', { system, nav: {}, win: {} }), true)
  assert.equal(triggerHaptic('task-done', { system, nav: {}, win: {} }), true)
  assert.equal(triggerHaptic('heading', { system, nav: {}, win: {} }), true)
  assert.equal(triggerHaptic('unknown', { system, nav: {}, win: {} }), false)
  assert.deepEqual(calls, ['threshold', 'task-done', 'heading'])

  const vibrated = []
  const nav = {
    vibrate: (ms) => {
      vibrated.push(ms)
      return true
    },
  }
  assert.equal(
    triggerHaptic('threshold', {
      system: null,
      nav,
      win: { matchMedia: () => ({ matches: false }) },
    }),
    true,
  )
  assert.deepEqual(vibrated, [12])

  assert.equal(
    triggerHaptic('threshold', {
      system: null,
      nav,
      win: { matchMedia: () => ({ matches: true }) },
    }),
    false,
  )
})
