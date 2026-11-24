import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Text } from '@codemirror/state'
import {
  calloutTypeChange,
  calloutTypeOf,
  isMenuEntryCurrent,
  menuKind,
  turnIntoChange,
} from './editor/block-actions.js'
import { documentBlocks } from './block-move.js'

const blockAt = (text, line) =>
  documentBlocks(text).find((block) => line >= block.first && line <= block.last)

const apply = (text, change) => text.slice(0, change.from) + change.insert + text.slice(change.to)

test('a paragraph turns into an alert and back', () => {
  const text = '# Nota\n\nCuidado com isso'
  const doc = Text.of(text.split('\n'))
  const alert = apply(text, turnIntoChange(doc, blockAt(text, 3), 'callout'))
  assert.equal(alert, '# Nota\n\n> [!NOTE]\n> Cuidado com isso')
  const block = blockAt(alert, 3)
  assert.equal(block.kind, 'callout')
  const back = apply(alert, turnIntoChange(Text.of(alert.split('\n')), block, 'p'))
  assert.equal(back, '# Nota\n\nCuidado com isso')
})

test('an alert keeps its title as text when it becomes another block', () => {
  const text = '# Nota\n\n> [!TIP] Atalho\n> Use Ctrl+K'
  const change = turnIntoChange(Text.of(text.split('\n')), blockAt(text, 3), 'list')
  assert.equal(apply(text, change), '# Nota\n\n- Atalho Use Ctrl+K')
})

test('the alert type changes in place', () => {
  const text = '# Nota\n\n> [!WARNING] Título\n> corpo'
  const doc = Text.of(text.split('\n'))
  const block = blockAt(text, 3)
  assert.equal(calloutTypeOf(doc, block), 'warning')
  assert.equal(
    apply(text, calloutTypeChange(doc, block, 'tip')),
    '# Nota\n\n> [!TIP] Título\n> corpo',
  )
  assert.equal(calloutTypeChange(doc, block, 'warning'), null)
  assert.equal(calloutTypeChange(doc, block, 'unknown'), null)
})

test('the heading entry keeps the current level', () => {
  assert.equal(menuKind('heading', 'h4'), 'h4')
  assert.equal(menuKind('heading', 'p'), 'h2')
  assert.equal(menuKind('list', 'h4'), 'list')
  assert.equal(isMenuEntryCurrent('heading', 'h3'), true)
  assert.equal(isMenuEntryCurrent('heading', 'p'), false)
})
