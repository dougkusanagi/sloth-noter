import test from 'node:test'
import assert from 'node:assert/strict'
import { createWriteQueue } from './write-queue.js'

const tick = () => new Promise((resolve) => setImmediate(resolve))

function deferredSave() {
  const calls = []
  const waiters = []
  const save = (document) => {
    calls.push(document)
    return new Promise((resolve) => {
      waiters.push(() => resolve(null))
    })
  }
  return { calls, save, resolveNext: () => waiters.shift()(), waiting: () => waiters.length }
}

test('coalesces documents queued before the first write starts', async () => {
  const save = deferredSave()
  const queue = createWriteQueue(save.save)
  queue.write('a')
  queue.write('b')
  queue.write('c')
  await tick()
  assert.deepEqual(save.calls, ['c'])
  assert.equal(save.waiting(), 1)
  save.resolveNext()
  await queue.whenIdle()
  assert.deepEqual(save.calls, ['c'])
})

test('a document requested while another write is in flight is written after it', async () => {
  const save = deferredSave()
  const queue = createWriteQueue(save.save)
  queue.write('first')
  await tick()
  assert.deepEqual(save.calls, ['first'])
  queue.write('second')
  await tick()
  assert.deepEqual(save.calls, ['first'])
  save.resolveNext()
  await tick()
  assert.deepEqual(save.calls, ['first', 'second'])
  save.resolveNext()
  await queue.whenIdle()
  assert.deepEqual(save.calls, ['first', 'second'])
})

test('a failing save is reported and does not stop the next write', async () => {
  const results = []
  const queue = createWriteQueue(
    async (document) => {
      if (document === 'bad') throw new Error('disk full')
      return null
    },
    (error) => results.push(error),
  )
  queue.write('bad')
  await queue.whenIdle()
  queue.write('good')
  await queue.whenIdle()
  assert.deepEqual(results, ['disk full', null])
})

test('whenIdle resolves when nothing was requested', async () => {
  const queue = createWriteQueue(async () => null)
  await queue.whenIdle()
  assert.equal(typeof queue.write, 'function')
})

test('idle waits for subsequent writes and exposes a failed save', async () => {
  const busy = []
  const queue = createWriteQueue(
    async (document) => (document === 'bad' ? 'disk full' : undefined),
    () => {},
    (value) => busy.push(value),
  )
  queue.write('good')
  queue.write('bad')
  assert.equal(await queue.whenIdle(), 'disk full')
  assert.equal(busy.at(-1), false)
})

test('typing across separate events saves only the final state after a pause', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls = []
  const busy = []
  const queue = createWriteQueue(
    async (document) => {
      calls.push(document)
    },
    () => {},
    (value) => busy.push(value),
    { debounceMs: 1200 },
  )
  for (const title of ['N.md', 'No.md', 'Nota.md']) {
    queue.write(title)
    t.mock.timers.tick(300)
    await tick()
  }
  assert.deepEqual(calls, [])
  assert.equal(busy.at(-1), true)
  // Background sync must not force an intermediate title onto disk.
  const idle = queue.whenIdle({ flush: false })
  t.mock.timers.tick(899)
  await tick()
  assert.deepEqual(calls, [])
  t.mock.timers.tick(1)
  await idle
  assert.deepEqual(calls, ['Nota.md'])
  assert.equal(busy.at(-1), false)
})

test('continuous typing still saves within the maximum wait', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls = []
  const queue = createWriteQueue(
    async (document) => {
      calls.push(document)
    },
    undefined,
    undefined,
    { debounceMs: 1200, maxWaitMs: 5000 },
  )
  for (let revision = 0; revision < 10; revision++) {
    queue.write(revision)
    t.mock.timers.tick(500)
    await tick()
  }
  assert.deepEqual(calls, [9])
  await queue.whenIdle()
})

test('explicit flush saves immediately and cancels the delayed duplicate', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const calls = []
  const queue = createWriteQueue(
    async (document) => {
      calls.push(document)
      return null
    },
    undefined,
    undefined,
    { debounceMs: 1200 },
  )
  queue.write('final')
  assert.equal(await queue.whenIdle(), null)
  assert.deepEqual(calls, ['final'])
  t.mock.timers.tick(10000)
  await tick()
  assert.deepEqual(calls, ['final'])
})

test('delayed edits during a slow save remain serialized and keep only the newest state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const save = deferredSave()
  const queue = createWriteQueue(save.save, undefined, undefined, { debounceMs: 1200 })
  queue.write('first')
  t.mock.timers.tick(1200)
  queue.write('second')
  t.mock.timers.tick(300)
  queue.write('third')
  t.mock.timers.tick(1200)
  assert.deepEqual(save.calls, ['first'])
  save.resolveNext()
  await tick()
  assert.deepEqual(save.calls, ['first', 'third'])
  save.resolveNext()
  await queue.whenIdle()
})
