import test from 'node:test'
import assert from 'node:assert/strict'
import { compareNoteSearch, matchesNote, noteSearchResult, titleMatchRank } from './note-search.js'

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

test('finds a completion date by its Brazilian display format', () => {
  const note = {
    name: 'Compras',
    body: '# Compras\n\n- [x] Café ✅ 2026-11-23\n\n- [-] Pão ❌ 2026-11-24\n\n2026-11-23',
  }
  const result = noteSearchResult(note, '23/11/2026')
  assert.deepEqual(
    result.matches.map(({ start, end }) => ({ start, end })),
    [
      { start: 24, end: 34 },
      { start: 60, end: 70 },
    ],
  )
  assert.equal(result.snippet.hit, '2026-11-23')
  assert.equal(noteSearchResult(note, '2026-11-23').matches.length, 2)
  assert.equal(noteSearchResult(note, 'concluída:23/11').snippet.hit, '✅ 2026-11-23')
  assert.equal(noteSearchResult(note, 'cancelada:24/11').snippet.hit, '❌ 2026-11-24')
})

test('search ranking prioritizes exact title, prefix, word start, substring, then body matches', () => {
  const notes = [
    { id: 'body-1', name: 'Diário.md', body: '# Diário\nUma menção a contas.' },
    { id: 'body-2', name: 'Resumo.md', body: '# Resumo\nContas do mês e contas futuras.' },
    { id: 'sub', name: 'Descontas.md', body: '# Descontas\nNada.' },
    { id: 'word', name: 'Minhas Contas.md', body: '# Minhas Contas\nNada.' },
    { id: 'prefix', name: 'Contas a pagar.md', body: '# Contas a pagar\nNada.' },
    { id: 'exact', name: '👀 Contas.md', body: '# 👀 Contas\nNada.' },
  ]
  const ordered = notes
    .map((note) => ({ note, result: noteSearchResult(note, 'contas') }))
    .filter(({ result }) => result.matches.length || result.titleMatches.length)
    .sort((a, b) => compareNoteSearch(a, b, 'contas'))
    .map(({ note }) => note.id)
  assert.deepEqual(ordered, ['exact', 'prefix', 'word', 'sub', 'body-2', 'body-1'])
  assert.equal(titleMatchRank('Prompts.md', 'md'), 0)
  assert.equal(
    noteSearchResult({ name: 'Prompts.md', body: '# Prompts' }, 'md').titleMatches.length,
    0,
  )
})
