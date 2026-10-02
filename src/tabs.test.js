import test from 'node:test'
import assert from 'node:assert/strict'
import { moveTab, togglePinnedTab } from './tabs.js'
import { newDocument, serializeDocument, validateDocument } from './storage.js'
import { moveToTrash } from './notes.js'
import { mergeExternal } from './vault-sync.js'

function document() {
  return {
    ...newDocument(),
    notes: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: `${id}.md`, body: id, revision: 0 })),
    openIds: ['a', 'b', 'c', 'd'],
    activeId: 'c',
  }
}

test('pinning groups tabs at the start without changing the active note', () => {
  const pinned = togglePinnedTab(togglePinnedTab(document(), 'c'), 'b')
  assert.deepEqual(pinned.openIds, ['c', 'b', 'a', 'd'])
  assert.equal(pinned.activeId, 'c')
  const unpinned = togglePinnedTab(pinned, 'c')
  assert.deepEqual(unpinned.openIds, ['b', 'c', 'a', 'd'])
  assert.deepEqual(unpinned.pinnedIds, ['b'])
  assert.equal(togglePinnedTab(pinned, 'missing'), pinned)
})

test('reordering works in both directions and stays inside each pin group', () => {
  assert.deepEqual(moveTab(document(), 'a', 3).openIds, ['b', 'c', 'd', 'a'])
  assert.deepEqual(moveTab(document(), 'd', 0).openIds, ['d', 'a', 'b', 'c'])
  const pinned = togglePinnedTab(togglePinnedTab(document(), 'c'), 'b')
  assert.deepEqual(moveTab(pinned, 'c', 99).openIds, ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveTab(pinned, 'd', -1).openIds, ['c', 'b', 'd', 'a'])
  assert.equal(moveTab(pinned, 'a', 0), pinned)
  assert.equal(moveTab(pinned, 'missing', 0), pinned)
})

test('pinning and order round trip; old documents and invalid pin data are handled', () => {
  const pinned = moveTab(togglePinnedTab(document(), 'c'), 'd', 1)
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(pinned))), pinned)
  assert.equal(validateDocument(document()).pinnedIds, undefined)
  for (const pinnedIds of [['missing'], ['a', 'a'], 'a']) {
    assert.throws(() => validateDocument({ ...document(), pinnedIds }), /Invalid pinned tabs/)
  }
})

test('trashing and external deletion remove stale pins', () => {
  const pinned = togglePinnedTab(document(), 'c')
  assert.deepEqual(moveToTrash(pinned, 'c', 1).pinnedIds, [])
  const known = new Map([['c.md', { id: 'c', body: 'c' }]])
  const merged = mergeExternal(pinned, [], known).document
  assert.deepEqual(merged.pinnedIds, [])
  validateDocument(merged)
})
