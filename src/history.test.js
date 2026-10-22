import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffTexts, applyForward, applyBackward, alerts, createHistory } from './history.js'

test('diff round trips Unicode, replacements and empty notes', () => {
  for (const [before, after] of [
    ['olá 🦥 fim', 'olá 🐈 fim'],
    ['', 'texto'],
    ['abc', ''],
    ['aaa texto z', 'aaa outro z'],
  ]) {
    const changes = diffTexts(before, after)
    assert.equal(applyForward(before, changes), after)
    assert.equal(applyBackward(after, changes), before)
  }
  const changes = [
    { de: 0, removido: 'a', inserido: 'xx' },
    { de: 2, removido: 'c', inserido: 'yy' },
  ]
  assert.equal(applyBackward(applyForward('abc', changes), changes), 'abc')
})
test('alerts include large removal and paste without intent', () => {
  assert.deepEqual(alerts('abc', diffTexts('abc', ''), 'input.paste', 'nenhum'), [
    'remocao-grande',
    'colagem-sem-gesto',
  ])
})
test('capture deduplicates fallback and reports write failure once', async () => {
  let warnings = 0
  const batches = []
  const history = createHistory(
    async (_command, args) => {
      batches.push(args.entries)
      throw new Error('full')
    },
    () => warnings++,
  )
  history.setEnabled(true)
  const note = { id: 'a', name: 'a.md', revision: 1 }
  history.record(note, 'a', 'ab', 'input.type')
  history.record(note, 'a', 'ab')
  await history.flush()
  history.record(note, 'ab', 'abc')
  await history.flush()
  assert.equal(batches[0].length, 1)
  assert.equal(warnings, 1)
})

test('continuous typing groups; paste and disk changes stay separate', async () => {
  const batches = []
  const history = createHistory(async (_command, args) => batches.push(args.entries))
  history.setEnabled(true)
  const note = { id: 'a', name: 'a.md', revision: 2 }
  history.record(note, 'a', 'ab', 'input.type')
  history.record(note, 'ab', 'abc', 'input.type')
  history.record(note, 'abc', 'abc paste', 'input.paste', 'ctrl+v')
  history.record(note, 'abc paste', 'from disk', 'disco')
  await history.flush()
  assert.equal(batches[0].length, 3)
  assert.equal(batches[0][0].antes, 'a')
  assert.equal(batches[0][0].depois, 'abc')
})

test('disabled history records nothing, including opening', async () => {
  const calls = []
  const history = createHistory(async (...args) => calls.push(args))
  const doc = {
    preferences: { historyEnabled: false },
    notes: [{ id: 'a', name: 'a.md', body: 'secret' }],
  }
  history.observe(doc, doc)
  history.record(doc.notes[0], 'secret', 'secret more', 'input.type')
  await history.flush()
  assert.equal(calls.length, 0)
})

test('off by default and disabled capture never examines text or transaction changes', async () => {
  const calls = []
  const history = createHistory(async (...args) => calls.push(args))
  const unreadable = new Proxy(
    {},
    {
      get() {
        throw new Error('Text was examined while history was off')
      },
    },
  )
  assert.equal(history.enabled, false)
  history.record({ id: 'a' }, unreadable, {}, 'input.type')
  history.observe({ notes: [] }, { preferences: {}, notes: [] })
  assert.equal(history.enabled, false)
  await history.flush()
  assert.deepEqual(calls, [])
})

test('grouping does not rescan the document on each keystroke', async () => {
  const batches = []
  const history = createHistory(async (_command, args) => batches.push(args.entries))
  history.setEnabled(true)
  const note = { id: 'a', name: 'a.md', revision: 1 }
  // A string-like base whose character reads fail: grouping must retain it,
  // not calculate a full prefix/suffix diff while the user is typing.
  let reads = 0
  const base = new Proxy(new String('large note'), {
    get(target, key) {
      if (/^\d+$/.test(String(key))) reads++
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  history.record(note, base, 'large notea', 'input.type', 'nenhum', [
    { de: 10, removido: '', inserido: 'a' },
  ])
  history.record(note, 'large notea', 'large noteab', 'input.type', 'nenhum', [
    { de: 11, removido: '', inserido: 'b' },
  ])
  assert.equal(reads, 0)
  await history.flush()
  assert.ok(reads > 0)
  assert.equal(applyForward(String(base), batches[0][0].mudancas), 'large noteab')
})

test('idle batching waits for a pause, forces progress during long typing, and close flushes immediately', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: 10000 })
  const calls = []
  const history = createHistory(async (_command, args) => calls.push(args.entries))
  history.setEnabled(true)
  const note = { id: 'a', name: 'a.md', revision: 1 }
  history.record(note, 'a', 'ab', 'input.type')
  context.mock.timers.tick(1000)
  await history.flushIfDue()
  assert.equal(calls.length, 0)
  history.record(note, 'ab', 'abc', 'input.type')
  context.mock.timers.tick(2000)
  await history.flushIfDue()
  assert.equal(calls.length, 1)
  for (let i = 0; i < 11; i++) {
    history.record(note, 'x'.repeat(i), 'x'.repeat(i + 1), 'input.type')
    context.mock.timers.tick(1000)
    await history.flushIfDue()
  }
  assert.equal(calls.length, 2)
  await history.flush()
  assert.equal(calls.length, 3)
})

test('a slow disk keeps a single request in flight and coalesces subsequent typing', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: 10000 })
  let release
  const stalled = new Promise((resolve) => {
    release = resolve
  })
  const batches = []
  const history = createHistory(async (_command, args) => {
    batches.push(args.entries)
    if (batches.length === 1) await stalled
  })
  history.setEnabled(true)
  const note = { id: 'a', name: 'a.md', revision: 1 }
  history.record(note, '', 'x', 'input.type')
  const first = history.flush()
  await Promise.resolve()
  for (let i = 1; i < 25; i++) {
    history.record(note, 'x'.repeat(i), 'x'.repeat(i + 1), 'input.type')
    context.mock.timers.tick(1000)
    void history.flushIfDue()
  }
  assert.equal(batches.length, 1)
  release()
  await first
  await history.flush()
  assert.equal(batches.length, 2)
  assert.equal(batches[1].length, 1)
  assert.equal(batches[1][0].depois, 'x'.repeat(25))
})
