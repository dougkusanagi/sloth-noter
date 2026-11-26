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
import {
  PENDING_NOTE_LIMIT,
  formatPendingNoteBody,
  ingestPendingNotes,
  parsePendingNotes,
} from './mobile/pending-notes.js'
import { newDocument, validateDocument } from './storage.js'
import {
  applyWidgetToggles,
  buildPinnedTasksWidgetSnapshot,
  parsePendingWidgetToggles,
} from './mobile/widget-tasks.js'
import { isStylusHandwritingSupported, isStylusPointer, isStylusTouch } from './mobile/stylus.js'
import {
  applyAiSuggestion,
  canShowOnDeviceAiAction,
  getOnDeviceAiState,
  requestOnDeviceAi,
} from './mobile/on-device-ai.js'

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
  assert.equal(classifyEditorSwipe({ startX: 10, startY: 200, endX: 100, endY: 200 }), null)
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

test('B4: parsePendingNotes, formatPendingNoteBody, and ingestPendingNotes handle pending lock-screen notes idempotently', () => {
  assert.deepEqual(parsePendingNotes(''), [])
  assert.deepEqual(parsePendingNotes('{invalid'), [])
  assert.deepEqual(parsePendingNotes([{ id: '', body: 'x' }, null, { id: 'q1', body: 'ok' }]), [
    { id: 'q1', title: '', body: 'ok', createdAt: null },
  ])

  assert.equal(formatPendingNoteBody({ title: '  ', body: '\n' }), null)
  assert.deepEqual(
    formatPendingNoteBody({
      title: '## Ideia\nRápida',
      body: 'Primeiro ponto',
      fallbackTitle: 'Nota rápida',
    }),
    { body: '# Ideia Rápida\n\nPrimeiro ponto' },
  )
  assert.deepEqual(
    formatPendingNoteBody({
      title: '',
      body: '# Título próprio\n\nTexto',
      fallbackTitle: 'Nota rápida',
    }),
    { body: '# Título próprio\n\nTexto' },
  )
  assert.deepEqual(
    formatPendingNoteBody({ title: '', body: 'Anotação solta', fallbackTitle: 'Nota rápida' }),
    { body: '# Nota rápida\n\nAnotação solta' },
  )
  assert.deepEqual(formatPendingNoteBody({ title: '', body: 'a'.repeat(PENDING_NOTE_LIMIT + 1) }), {
    tooLarge: true,
  })

  const base = {
    ...newDocument(),
    notes: [
      { id: 'existing-active', name: 'Ativa.md', body: '# Ativa', revision: 0, modifiedAt: 10 },
    ],
    trash: [
      {
        note: {
          id: 'existing-trash',
          name: 'Apagada.md',
          body: '# Apagada',
          revision: 0,
          modifiedAt: 10,
        },
        index: 0,
        deletedAt: 20,
      },
    ],
    openIds: ['existing-active'],
    activeId: 'existing-active',
  }

  const payload = JSON.stringify([
    { id: 'q-title', title: 'Lista', body: '- [ ] Leite', createdAt: 1700000001000 },
    { id: 'q-body', title: '', body: 'Ligar para Ana', createdAt: 1700000002000 },
    { id: 'q-empty', title: '  ', body: '' },
    { id: 'q-huge', title: '', body: 'x'.repeat(PENDING_NOTE_LIMIT + 1) },
    { id: 'existing-active', title: 'Duplicada', body: 'Ignorar' },
    { id: 'existing-trash', title: 'Na lixeira', body: 'Ignorar' },
  ])

  const first = ingestPendingNotes(base, payload, {
    fallbackTitle: 'Nota rápida',
    now: 1700000000000,
  })
  assert.deepEqual(first.createdIds, ['q-title', 'q-body'])
  assert.deepEqual(first.ackIds, [
    'q-title',
    'q-body',
    'q-empty',
    'q-huge',
    'existing-active',
    'existing-trash',
  ])
  assert.equal(first.skippedTooLarge, true)
  assert.equal(first.lastCreatedId, 'q-body')
  assert.equal(first.document.notes.length, 3)
  const importedTitle = first.document.notes.find((note) => note.id === 'q-title')
  const importedBody = first.document.notes.find((note) => note.id === 'q-body')
  assert.equal(importedTitle.body, '# Lista\n\n- [ ] Leite')
  assert.equal(importedTitle.createdAt, 1700000001000)
  assert.equal(importedTitle.modifiedAt, 1700000001000)
  assert.equal(importedBody.body, '# Nota rápida\n\nLigar para Ana')
  validateDocument(first.document)

  // Re-running with the same payload before ack must not duplicate notes.
  const second = ingestPendingNotes(first.document, payload, { fallbackTitle: 'Nota rápida' })
  assert.deepEqual(second.createdIds, [])
  assert.equal(second.document.notes.length, 3)
})

test('pinned tasks widget snapshot and toggles follow tasks.js rules (B5)', () => {
  const doc = {
    notes: [
      { id: 'n1', pinned: false, body: '# Solta\n- [ ] Não fixada\n' },
      { id: 'n2', pinned: true, body: '# Sem tarefas\nTexto comum\n' },
      {
        id: 'n3',
        pinned: true,
        body: '# Compras\n- [ ] Pão\n- [x] Leite\n- [-] Cancelada\n## Arquivo\n- [x] Antiga\n',
      },
    ],
  }
  const snapshot = buildPinnedTasksWidgetSnapshot(doc)
  assert.equal(snapshot.noteId, 'n3')
  assert.equal(snapshot.title, 'Compras')
  assert.equal(snapshot.totalCount, 2)
  assert.deepEqual(snapshot.tasks, [
    { line: 2, status: 'todo', done: false, text: 'Pão' },
    { line: 3, status: 'done', done: true, text: 'Leite' },
  ])

  const parsed = parsePendingWidgetToggles(
    JSON.stringify([
      { id: 't1', noteId: 'n3', line: 2, text: 'Pão', targetStatus: 'done' },
      { id: '', noteId: 'n3', line: 2, targetStatus: 'done' },
      { id: 't2', noteId: 'n3', line: 3, targetStatus: 'invalid' },
    ]),
  )
  assert.deepEqual(parsed, [{ id: 't1', noteId: 'n3', line: 2, text: 'Pão', targetStatus: 'done' }])

  const shiftedDoc = {
    ...newDocument(),
    notes: [
      {
        id: 'n3',
        pinned: true,
        body: '# Compras\nLinha extra\n- [ ] Pão\n- [x] Leite\n',
      },
    ],
  }
  const applied = applyWidgetToggles(
    shiftedDoc,
    [
      { id: 't1', noteId: 'n3', line: 2, text: 'Pão', targetStatus: 'done' },
      { id: 't2', noteId: 'n3', line: 4, text: 'Leite', targetStatus: 'todo' },
    ],
    { dates: false },
  )
  assert.equal(applied.changedCount, 2)
  assert.deepEqual(applied.ackIds, ['t1', 't2'])
  assert.equal(applied.document.notes[0].body, '# Compras\nLinha extra\n- [x] Pão\n- [ ] Leite\n')
})

test('stylus handwriting detection keeps pen strokes free from editor swipes (B6)', () => {
  assert.equal(isStylusPointer({ pointerType: 'pen' }), true)
  assert.equal(isStylusPointer({ pointerType: 'touch' }), false)
  assert.equal(isStylusTouch({ touches: [{ touchType: 'stylus' }] }), true)
  assert.equal(isStylusTouch({ touches: [{ touchType: 'direct' }] }), false)
  assert.equal(
    isStylusHandwritingSupported({ SlothSystem: { isStylusHandwritingSupported: () => true } }),
    true,
  )
  assert.equal(
    isStylusHandwritingSupported({ SlothSystem: { isStylusHandwritingSupported: () => false } }),
    false,
  )
  assert.equal(
    classifyEditorSwipe({
      startX: 60,
      startY: 120,
      endX: 180,
      endY: 122,
      viewportWidth: 390,
      isStylus: true,
    }),
    null,
  )
})

test('on-device AI stays hidden without model and only edits after explicit accept (B7)', async () => {
  assert.equal(getOnDeviceAiState({}), 'unavailable')
  assert.equal(
    getOnDeviceAiState({ SlothSystem: { getOnDeviceAiState: () => 'available' } }),
    'available',
  )
  assert.equal(
    canShowOnDeviceAiAction({ state: 'unavailable', enabled: true, body: '# Nota\nTexto' }),
    false,
  )
  assert.equal(
    canShowOnDeviceAiAction({ state: 'available', enabled: false, body: '# Nota\nTexto' }),
    false,
  )
  assert.equal(
    canShowOnDeviceAiAction({ state: 'available', enabled: true, body: '# Nota\nTexto' }),
    true,
  )

  const env = {
    SlothSystem: {
      runOnDeviceAi(id, action) {
        queueMicrotask(() =>
          env.__slothAiResult?.(id, JSON.stringify({ ok: true, text: `Resultado ${action}` })),
        )
        return true
      },
    },
  }
  const res = await requestOnDeviceAi({ action: 'summarize', text: 'Conteúdo', env })
  assert.deepEqual(res, { ok: true, suggestion: 'Resultado summarize', error: null })

  const summarized = applyAiSuggestion({
    body: '# Reunião\n\nPontos discutidos.',
    action: 'summarize',
    suggestion: 'Decidimos lançar sexta.',
    summaryHeading: 'Resumo',
  })
  assert.equal(
    summarized,
    '# Reunião\n\n> [!NOTE] Resumo\n> Decidimos lançar sexta.\n\nPontos discutidos.',
  )

  const proofread = applyAiSuggestion({
    body: '# Reunião\n\nPontos discutido.',
    action: 'proofread',
    suggestion: 'Pontos discutidos.',
  })
  assert.equal(proofread, '# Reunião\n\nPontos discutidos.\n')
})
