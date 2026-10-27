import test from 'node:test'
import assert from 'node:assert/strict'
import { downloadUpdate, saveBeforeUpdate } from './app-updates.js'
import { createWriteQueue } from './write-queue.js'

test('download reports real progress but signature verification must finish before readiness', async () => {
  const progress = []
  let finishVerification
  const verified = new Promise((resolve) => {
    finishVerification = resolve
  })
  let ready = false
  const update = {
    download: async (event, options) => {
      assert.equal(options.timeout, 300000)
      event({ event: 'Started', data: { contentLength: 100 } })
      event({ event: 'Progress', data: { chunkLength: 40 } })
      event({ event: 'Progress', data: { chunkLength: 60 } })
      event({ event: 'Finished' })
      await verified
    },
  }
  const operation = downloadUpdate(update, (item) => progress.push(item)).then(() => {
    ready = true
  })
  await Promise.resolve()
  assert.equal(ready, false)
  assert.deepEqual(
    progress.map((item) => item.percent),
    [0, 40, 99, 99],
  )
  assert.equal(progress.at(-1).verifying, true)
  finishVerification()
  await operation
  assert.equal(ready, true)
})

test('unknown download size stays indeterminate and signature failures reject', async () => {
  const progress = []
  await assert.rejects(
    downloadUpdate(
      {
        download: async (event) => {
          event({ event: 'Started', data: {} })
          event({ event: 'Progress', data: { chunkLength: 1000 } })
          event({ event: 'Finished' })
          throw new Error('Invalid signature')
        },
      },
      (item) => progress.push(item),
    ),
  )
  assert.equal(
    progress.every((item) => item.percent === null),
    true,
  )
})

test('saving before installation flushes the latest debounced notes before history', async () => {
  const saved = []
  const writer = createWriteQueue(
    async (document) => {
      saved.push(document.body)
    },
    undefined,
    undefined,
    { debounceMs: 60000 },
  )
  writer.write({ body: 'older' })
  writer.write({ body: 'newer' })
  await saveBeforeUpdate(
    writer,
    { body: 'latest edit' },
    {
      flush: async () => {
        assert.deepEqual(saved, ['latest edit'])
      },
    },
  )
  assert.deepEqual(saved, ['latest edit'])
})

test('a note-save failure aborts installation and can be retried without losing the document', async () => {
  let fail = true
  const saved = []
  const writer = createWriteQueue(async (document) => {
    if (fail) throw new Error('disk full')
    saved.push(document.body)
  })
  const history = { flush: async () => {} }
  await assert.rejects(saveBeforeUpdate(writer, { body: 'keep my edit' }, history))
  assert.deepEqual(saved, [])
  fail = false
  await saveBeforeUpdate(writer, { body: 'keep my edit' }, history)
  assert.deepEqual(saved, ['keep my edit'])
})

test('a late save failure also prevents exiting', async () => {
  await assert.rejects(
    saveBeforeUpdate(
      {
        write: () => {},
        whenIdle: (() => {
          let count = 0
          return async () => (++count === 1 ? undefined : 'disk full')
        })(),
      },
      {},
      { flush: async () => {} },
    ),
  )
})
