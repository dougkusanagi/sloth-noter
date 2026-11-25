import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newDocument, validateDocument } from './storage.js'
import {
  applyNoteCover,
  applyNoteIcon,
  closeOpenNoteDocument,
  closeOtherOpenNotesDocument,
  createNoteDocument,
  renameNoteDocument,
  setNoteBoardView,
  setNoteGroupDocument,
  toggleNoteWrap,
  togglePinnedNote,
  updateNoteBody,
} from './document-mutations.js'

test('createNoteDocument and updateNoteBody maintain modifiedAt, revision and wiki links', () => {
  const base = newDocument()
  const { document: withNote, note } = createNoteDocument(base, {
    id: 'n1',
    title: 'Projeto',
    prepend: true,
    modifiedAt: 1000,
  })
  assert.equal(note.name, 'Projeto.md')
  assert.equal(note.body, '# Projeto')
  assert.equal(note.modifiedAt, 1000)
  assert.equal(withNote.notes[0].id, 'n1')

  const linked = {
    ...withNote,
    notes: [
      ...withNote.notes,
      { id: 'n2', name: 'Indice.md', body: '# Indice\n\nVeja [[Projeto]]', revision: 0 },
    ],
  }
  const updated = updateNoteBody(linked, 'n1', '# Plano\n\nTexto', { modifiedAt: 2000 })
  const target = updated.notes.find((item) => item.id === 'n1')
  const referrer = updated.notes.find((item) => item.id === 'n2')
  assert.equal(target.name, 'Plano.md')
  assert.equal(target.modifiedAt, 2000)
  assert.equal(target.revision, 1)
  assert.equal(referrer.body, '# Indice\n\nVeja [[Plano]]')
  assert.equal(referrer.revision, 1)
  validateDocument(updated)
})

test('renameNoteDocument validates names, rejects external notes and updates frontmatter notes', () => {
  const { document: doc } = createNoteDocument(newDocument(), {
    id: 'n1',
    body: '---\ntags: [a]\n---\n# Antigo\n\nCorpo',
  })
  const renamed = renameNoteDocument(doc, 'n1', 'Novo')
  assert.equal(renamed.error, undefined)
  assert.equal(
    renamed.document.notes.find((item) => item.id === 'n1').body,
    '---\ntags: [a]\n---\n# Novo\n\nCorpo',
  )
  assert.equal(renameNoteDocument(doc, 'n1', 'a/b').error, 'mobile.invalidName')
  assert.equal(renameNoteDocument(doc, 'missing', 'X').error, 'mobile.noteGone')
})

test('preference and metadata helpers toggle pin, board, wrap, cover and icon', () => {
  const { document: doc } = createNoteDocument(newDocument(), {
    id: 'n1',
    title: 'Nota',
  })
  const pinned = togglePinnedNote(doc, 'n1')
  assert.deepEqual(pinned.pinnedIds, ['n1'])
  assert.deepEqual(togglePinnedNote(pinned, 'n1').pinnedIds, [])

  const boardOn = setNoteBoardView({}, 'n1', true)
  assert.equal(boardOn.boardNotes.n1, true)
  assert.equal(setNoteBoardView(boardOn, 'n1', false).boardNotes.n1, undefined)

  const wrappedOff = toggleNoteWrap({ wrapLines: true }, 'n1')
  assert.equal(wrappedOff.wrapLinesByNote.n1, false)
  assert.equal(toggleNoteWrap({ wrapLines: true, ...wrappedOff }, 'n1').wrapLinesByNote.n1, true)

  const withIcon = applyNoteIcon(doc, 'n1', '🦥')
  assert.match(withIcon.notes.find((item) => item.id === 'n1').body, /🦥/)

  const withCover = applyNoteCover(doc, 'n1', { src: 'img/capa.webp', name: 'capa.webp' }, true)
  assert.equal(withCover.assets.length, 1)
  validateDocument(withCover)
})

test('setNoteGroupDocument moves a note between valid groups and clears unknown groups', () => {
  const base = { ...newDocument(), groups: ['Trabalho', 'Pessoal'] }
  const { document: doc } = createNoteDocument(base, { id: 'n1', title: 'Nota' })
  const moved = setNoteGroupDocument(doc, 'n1', 'Trabalho')
  assert.equal(moved.notes.find((item) => item.id === 'n1').group, 'Trabalho')
  assert.equal(setNoteGroupDocument(moved, 'n1', 'Trabalho'), moved)
  const cleared = setNoteGroupDocument(moved, 'n1', 'Inexistente')
  assert.equal(cleared.notes.find((item) => item.id === 'n1').group, undefined)
  validateDocument(cleared)
})

test('closeOpenNoteDocument and closeOtherOpenNotesDocument update openIds without deleting notes', () => {
  let doc = newDocument()
  doc = createNoteDocument(doc, { id: 'a', title: 'A' }).document
  doc = createNoteDocument(doc, { id: 'b', title: 'B' }).document
  doc = createNoteDocument(doc, { id: 'c', title: 'C' }).document
  const closedC = closeOpenNoteDocument(doc, 'c')
  assert.equal(closedC.openIds.includes('c'), false)
  assert.equal(
    closedC.notes.some((note) => note.id === 'c'),
    true,
  )
  assert.equal(closedC.activeId, 'b')
  const onlyB = closeOtherOpenNotesDocument(closedC, 'b')
  assert.deepEqual(onlyB.openIds, ['b'])
  assert.equal(onlyB.activeId, 'b')
  validateDocument(onlyB)
})
