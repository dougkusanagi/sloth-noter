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
