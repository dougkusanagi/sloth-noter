import test from 'node:test'
import assert from 'node:assert/strict'
import { runNoteTransition } from './mobile/view-transition.js'
import { triggerHaptic } from './mobile/haptics.js'
import { adjacentOpenNoteId, classifyHeaderGesture } from './mobile/header-gestures.js'
import { classifyEditorSwipe, structureSwipeEdit } from './mobile/editor-gestures.js'
import { classifyPinch, headingIndexForRatio, stepReadingZoom } from './mobile/reading-zoom.js'
import { nextBlockCursor } from './mobile/structural-trackpad.js'
import {
  adjacentColumnIndex,
  classifyBoardCardSwipe,
  classifyBoardColumnSwipe,
} from './mobile/board-gestures.js'
import { initialNavigation, navigate } from './mobile/nav-stack.js'

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

test('B8 & B9: classifyHeaderGesture detects pull-down commands and horizontal note deck swipe', () => {
  assert.equal(classifyHeaderGesture({ startX: 180, startY: 20, endX: 185, endY: 80 }), 'commands')
  assert.equal(
    classifyHeaderGesture({
      startX: 200,
      startY: 30,
      endX: 120,
      endY: 34,
      canSwitchNotes: true,
    }),
    'next',
  )
  assert.equal(
    classifyHeaderGesture({
      startX: 120,
      startY: 30,
      endX: 200,
      endY: 34,
      canSwitchNotes: true,
    }),
    'prev',
  )
  // Edge swipe and active selection must not trigger note switching.
  assert.equal(
    classifyHeaderGesture({
      startX: 10,
      startY: 30,
      endX: 100,
      endY: 30,
      canSwitchNotes: true,
    }),
    null,
  )
  assert.equal(
    classifyHeaderGesture({
      startX: 120,
      startY: 30,
      endX: 200,
      endY: 30,
      canSwitchNotes: true,
      hasSelection: true,
    }),
    null,
  )
  assert.equal(adjacentOpenNoteId(['a', 'b', 'c'], 'b', 'next'), 'c')
  assert.equal(adjacentOpenNoteId(['a', 'b', 'c'], 'b', 'prev'), 'a')
  assert.equal(adjacentOpenNoteId(['a', 'b', 'c'], 'a', 'prev'), null)
  assert.equal(adjacentOpenNoteId(['a'], 'a', 'next'), null)

  // Deck swipe replaces the current note on the nav stack so Back returns straight to the list.
  let nav = navigate(initialNavigation('notes'), { type: 'push', route: { name: 'note', id: 'a' } })
  nav = navigate(nav, { type: 'push', replace: true, route: { name: 'note', id: 'b' } })
  assert.equal(nav.screens.length, 2)
  assert.equal(nav.screens[1].id, 'b')
  nav = navigate(nav, { type: 'back' })
  assert.equal(nav.screens.length, 1)
  assert.equal(nav.screens[0].name, 'notes')
})

test('B10: structureSwipeEdit indents/outdents list items and converts paragraphs to tasks', () => {
  const doc = '# Nota\n\n- Primeiro\n- Segundo\n\nTexto solto\n'
  const secondPos = doc.indexOf('- Segundo') + 2
  const indent = structureSwipeEdit(doc, secondPos, 'right')
  assert.ok(indent && indent.length > 0)
  assert.equal(indent[0].insert, '    ')

  const indentedDoc = '# Nota\n\n- Primeiro\n    - Segundo\n'
  const outdent = structureSwipeEdit(indentedDoc, indentedDoc.indexOf('Segundo'), 'left')
  assert.ok(outdent && outdent.length > 0)
  assert.equal(outdent[0].insert, '')

  const paraPos = doc.indexOf('Texto solto') + 3
  const toTask = structureSwipeEdit(doc, paraPos, 'right')
  assert.ok(toTask && toTask.length === 1)
  assert.equal(toTask[0].insert, '- [ ] Texto solto')

  // Swiping left on a plain paragraph or swiping on the title does nothing.
  assert.equal(structureSwipeEdit(doc, paraPos, 'left'), null)
  assert.equal(structureSwipeEdit(doc, 2, 'right'), null)

  assert.equal(classifyEditorSwipe({ startX: 100, startY: 200, endX: 180, endY: 205 }), 'right')
  assert.equal(classifyEditorSwipe({ startX: 180, startY: 200, endX: 100, endY: 205 }), 'left')
  assert.equal(
    classifyEditorSwipe({ startX: 10, startY: 200, endX: 100, endY: 200 }),
    null,
  )
  assert.equal(
    classifyEditorSwipe({ startX: 100, startY: 200, endX: 180, endY: 200, hasSelection: true }),
    null,
  )
})

test('B11 & B12: heading ruler ratio mapping and semantic reading zoom levels', () => {
  assert.equal(headingIndexForRatio(4, 0), 0)
  assert.equal(headingIndexForRatio(4, 0.5), 2)
  assert.equal(headingIndexForRatio(4, 1), 3)
  assert.equal(headingIndexForRatio(0, 0.5), -1)

  assert.equal(stepReadingZoom('full', 'out'), 'outline')
  assert.equal(stepReadingZoom('outline', 'out'), 'headings')
  assert.equal(stepReadingZoom('headings', 'out'), 'headings')
  assert.equal(stepReadingZoom('headings', 'in'), 'outline')
  assert.equal(stepReadingZoom('outline', 'in'), 'full')
  assert.equal(stepReadingZoom('headings'), 'full')

  assert.equal(classifyPinch(100, 70), 'out')
  assert.equal(classifyPinch(100, 135), 'in')
  assert.equal(classifyPinch(100, 105), null)
})

test('B14: nextBlockCursor jumps cleanly between Markdown blocks', () => {
  const doc = '# Título\n\nPrimeiro parágrafo\n\n## Seção\n\n- Item 1\n- Item 2\n'
  const p1 = doc.indexOf('Primeiro')
  const h2 = doc.indexOf('## Seção')
  const i1 = doc.indexOf('- Item 1')
  assert.equal(nextBlockCursor(doc, p1, 1), h2)
  assert.equal(nextBlockCursor(doc, h2, 1), i1)
  assert.equal(nextBlockCursor(doc, i1, -1), h2)
  assert.equal(nextBlockCursor(doc, p1, -1), null)
})

test('B15: board gestures move cards and switch columns safely away from edges', () => {
  assert.equal(classifyBoardCardSwipe({ startX: 100, startY: 200, endX: 200, endY: 205 }), 1)
  assert.equal(classifyBoardCardSwipe({ startX: 200, startY: 200, endX: 100, endY: 205 }), -1)
  assert.equal(classifyBoardCardSwipe({ startX: 10, startY: 200, endX: 120, endY: 200 }), 0)
  assert.equal(classifyBoardColumnSwipe({ startX: 220, startY: 300, endX: 120, endY: 305 }), 1)
  assert.equal(classifyBoardColumnSwipe({ startX: 120, startY: 300, endX: 220, endY: 305 }), -1)
  assert.equal(adjacentColumnIndex(3, 0, 1), 1)
  assert.equal(adjacentColumnIndex(3, 0, -1), -1)
  assert.equal(adjacentColumnIndex(3, 2, 1), -1)
})
