import assert from 'node:assert/strict'
import test from 'node:test'
import { canShare, shareText } from './mobile/share.js'

test('uses the Android bridge and reports failure', async () => {
  const calls = []
  const env = { SlothShare: { shareText: (...args) => (calls.push(args), true) } }
  assert.equal(canShare(env), true)
  assert.equal(await shareText({ title: 'T', text: 'x' }, env), 'shared')
  assert.deepEqual(calls, [['T', 'x']])
  await assert.rejects(
    shareText({ title: 'T', text: 'x' }, { SlothShare: { shareText: () => false } }),
  )
})

test('web share: success, cancel, failure; none available', async () => {
  const web = (share) => ({ navigator: { share } })
  assert.equal(
    await shareText(
      { text: 'x' },
      web(async () => {}),
    ),
    'shared',
  )
  const abort = Object.assign(new Error('x'), { name: 'AbortError' })
  assert.equal(
    await shareText(
      { text: 'x' },
      web(async () => Promise.reject(abort)),
    ),
    'cancelled',
  )
  await assert.rejects(
    shareText(
      { text: 'x' },
      web(async () => Promise.reject(new Error('x'))),
    ),
  )
  assert.equal(canShare({ navigator: {} }), false)
  assert.equal(await shareText({ text: 'x' }, { navigator: {} }), 'unavailable')
})

test('file sharing needs the Android bridge and reports failure', async () => {
  const { canShareFile, shareFile } = await import('./mobile/share.js')
  assert.equal(canShareFile({ navigator: { share() {} } }), false)
  assert.equal(await shareFile({ name: 'a.md', text: 'x' }, {}), 'unavailable')
  const calls = []
  const ok = { SlothShare: { shareFile: (...args) => (calls.push(args), true) } }
  assert.equal(await shareFile({ name: 'a.md', text: 'x' }, ok), 'shared')
  assert.deepEqual(calls, [['a.md', 'x']])
  await assert.rejects(
    shareFile({ name: 'a.md', text: 'x' }, { SlothShare: { shareFile: () => false } }),
  )
})
