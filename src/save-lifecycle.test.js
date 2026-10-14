import test from 'node:test'
import assert from 'node:assert/strict'
import { protectPendingSaves } from './save-lifecycle.js'
import { createWriteQueue } from './write-queue.js'

function host() {
  const target = new EventTarget()
  target.document = new EventTarget()
  let close
  let destroyed = 0
  let removed = false
  const loadWindow = async () => ({
    getCurrentWindow: () => ({
      onCloseRequested: async (handler) => {
        close = handler
        return () => {
          removed = true
        }
      },
      destroy: async () => {
        destroyed++
      },
    }),
  })
  return {
    target,
    loadWindow,
    close: () => close({ preventDefault() {} }),
    destroyed: () => destroyed,
    removed: () => removed,
  }
}

test('closing immediately after typing waits for the newest save before destroying the window', async () => {
  const app = host()
  let finish
  const calls = []
  const queue = createWriteQueue(
    (document) => {
      calls.push(document)
      return new Promise((resolve) => {
        finish = resolve
      })
    },
    undefined,
    undefined,
    { debounceMs: 1200 },
  )
  const cleanup = await protectPendingSaves(queue, true, app.target, app.loadWindow)
  queue.write('old')
  queue.write('latest')
  const closing = app.close()
  assert.deepEqual(calls, ['latest'])
  assert.equal(app.destroyed(), 0)
  finish(null)
  await closing
  assert.equal(app.destroyed(), 1)
  cleanup()
  assert.equal(app.removed(), true)
})

test('a failed close save keeps the window open and allows a successful retry', async () => {
  const app = host()
  let failure = 'disk full'
  const queue = createWriteQueue(async () => failure, undefined, undefined, { debounceMs: 1200 })
  const cleanup = await protectPendingSaves(queue, true, app.target, app.loadWindow)
  queue.write('note')
  await app.close()
  assert.equal(app.destroyed(), 0)
  failure = null
  queue.write('retry')
  await app.close()
  assert.equal(app.destroyed(), 1)
  cleanup()
})

test('switching apps flushes pending edits and cleanup removes the listeners', async () => {
  const app = host()
  const calls = []
  const queue = createWriteQueue(
    async (document) => {
      calls.push(document)
    },
    undefined,
    undefined,
    { debounceMs: 1200 },
  )
  const cleanup = await protectPendingSaves(queue, false, app.target)
  queue.write('note')
  app.target.dispatchEvent(new Event('blur'))
  await queue.whenIdle()
  assert.deepEqual(calls, ['note'])
  cleanup()
})
