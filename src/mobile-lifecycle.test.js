import assert from 'node:assert/strict'
import { test } from 'node:test'
import { flushOnHide } from './mobile/lifecycle.js'

function fakeTarget(visibilityState = 'visible') {
  const listeners = new Map()
  return {
    document: {
      get visibilityState() {
        return visibilityState
      },
      addEventListener: (name, fn) => listeners.set(`document:${name}`, fn),
      removeEventListener: (name) => listeners.delete(`document:${name}`),
    },
    addEventListener: (name, fn) => listeners.set(`window:${name}`, fn),
    removeEventListener: (name) => listeners.delete(`window:${name}`),
    setVisibility(next) {
      visibilityState = next
    },
    dispatch(name) {
      listeners.get(name)?.()
    },
    has(name) {
      return listeners.has(name)
    },
  }
}

test('hiding the page flushes the queues and showing it does not', () => {
  const target = fakeTarget()
  let flushes = 0
  flushOnHide(target, () => flushes++)
  target.dispatch('document:visibilitychange')
  assert.equal(flushes, 0)
  target.setVisibility('hidden')
  target.dispatch('document:visibilitychange')
  assert.equal(flushes, 1)
})

test('pagehide flushes the queues and cleanup removes both listeners', () => {
  const target = fakeTarget()
  let flushes = 0
  const cleanup = flushOnHide(target, () => flushes++)
  target.dispatch('window:pagehide')
  assert.equal(flushes, 1)
  cleanup()
  assert.equal(target.has('document:visibilitychange'), false)
  assert.equal(target.has('window:pagehide'), false)
  target.dispatch('window:pagehide')
  assert.equal(flushes, 1)
})
