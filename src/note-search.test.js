import test from 'node:test'
import assert from 'node:assert/strict'
import { matchesNote, noteSearchResult } from './note-search.js'

test('global search finds body content far below the preview and ignores accents', () => {
  const note = {
    name: 'Projeto.md',
    body:
      '# Projeto\n\n' + 'Introdução. '.repeat(80) + '\nAdicionar opções de edição.\nMais edição.',
  }
  const result = noteSearchResult(note, ' EDICAO ')
  assert.equal(result.matches.length, 2)
  assert.equal(result.snippet.hit, 'edição')
  assert.ok(result.snippet.before.includes('opções'))
  assert.equal(note.body.slice(result.matches[0].start, result.matches[0].end), 'edição')
  assert.equal(matchesNote(note, 'edição'), true)
  assert.equal(matchesNote(note, 'ausente'), false)
})

test('title-only and empty queries still find notes; regex characters are literal', () => {
  const note = { name: 'Planejamento.md', body: '# Outro título\n- [ ] Revisar' }
  assert.equal(matchesNote(note, 'planejamento'), true)
  assert.equal(noteSearchResult(note, 'planejamento').snippet, null)
  assert.equal(matchesNote(note, '   '), true)
  assert.equal(noteSearchResult(note, '[ ]').snippet.hit, '[ ]')
  assert.equal(matchesNote(note, '.*'), false)
})
