import { test } from 'node:test'
import assert from 'node:assert/strict'
import { taskSettings } from './tasks.js'
import {
  boardColumns,
  columnStatus,
  isTaskNote,
  makeTaskNote,
  moveCardToColumn,
  moveTasksToSection,
  sectionTitles,
} from './task-note.js'

const NOTE = [
  '---',
  'tipo: tarefas',
  '---',
  '# Projeto',
  '',
  '## Fazer',
  '- [ ] Tela',
  '    - [ ] Botão',
  '- [ ] API',
  '',
  '## Revisão',
  '',
  '## Feito',
  '- [x] Login',
  '',
  '## Arquivo',
  '- [x] Velha',
  '',
].join('\n')

test('a task note is marked with tipo: tarefas or type: tasks', () => {
  assert.equal(isTaskNote(NOTE), true)
  assert.equal(isTaskNote('---\ntype: Tasks\n---\n# T\n'), true)
  assert.equal(isTaskNote('---\ntipo: reunião\n---\n# T\n'), false)
  assert.equal(isTaskNote('# T\n\n## Fazer\n'), false)
})

test('known column names stand for a status, ignoring case and accents', () => {
  assert.equal(columnStatus('Fazer'), 'todo')
  assert.equal(columnStatus('A FAZER'), 'todo')
  assert.equal(columnStatus('Em andamento'), 'doing')
  assert.equal(columnStatus('Aguardando'), 'waiting')
  assert.equal(columnStatus('Concluídas'), 'done')
  assert.equal(columnStatus('Revisão'), null)
})

test('columns are the H2 sections, without the archive', () => {
  assert.deepEqual(
    boardColumns(NOTE).map((column) => [
      column.title,
      column.status,
      column.cards.map((c) => c.text),
    ]),
    [
      ['Fazer', 'todo', ['Tela', 'API']],
      ['Revisão', null, []],
      ['Feito', 'done', ['Login']],
    ],
  )
})

test('moving to a known column moves the block and sets the status', () => {
  const saved = taskSettings.dates
  taskSettings.dates = false
  try {
    const tela = boardColumns(NOTE)[0].cards[0]
    const done = moveCardToColumn(NOTE, tela.mark, 'Feito')
    assert.match(done, /## Feito\n- \[x\] Login\n- \[x\] Tela\n {4}- \[ \] Botão\n/)
    assert.doesNotMatch(done.split('## Feito')[0], /Tela/)
    // A column of one's own keeps the box as it is.
    const login = boardColumns(NOTE)[2].cards[0]
    const review = moveCardToColumn(NOTE, login.mark, 'Revisão')
    assert.match(review, /## Revisão\n\n- \[x\] Login\n/)
    // Before another card of the column.
    const api = boardColumns(NOTE)[0].cards[1]
    const first = moveCardToColumn(NOTE, api.mark, 'Fazer', tela.mark)
    assert.match(first, /## Fazer\n- \[ \] API\n- \[ \] Tela\n/)
    // With the completion date, the marks after the card shift; dropping before one still works.
    taskSettings.dates = true
    const dated = moveCardToColumn(NOTE, tela.mark, 'Feito', login.mark)
    assert.match(
      dated,
      /## Feito\n- \[x\] Tela ✅ \d{4}-\d{2}-\d{2}\n {4}- \[ \] Botão\n- \[x\] Login\n/,
    )
  } finally {
    taskSettings.dates = saved
  }
})

test('makeTaskNote marks the note and adds the default columns when it has no sections', () => {
  const now = new Date(2026, 10, 23)
  assert.equal(
    makeTaskNote('# Projeto\n\nTexto\n', { now }),
    '---\ntipo: tarefas\ncriada: 2026-11-23\n---\n# Projeto\n\nTexto\n\n## Fazer\n\n## Fazendo\n\n## Esperando\n\n## Feito\n',
  )
  // Existing sections are the columns; the creation date is kept.
  const marked = makeTaskNote('---\ncriada: 2026-01-02\n---\n# P\n\n## Etapa\n', { now })
  assert.equal(marked, '---\ncriada: 2026-01-02\ntipo: tarefas\n---\n# P\n\n## Etapa\n')
  assert.equal(makeTaskNote(marked, { now }), marked)
})

test('selected tasks move to another section; only a task note changes their status', () => {
  const saved = taskSettings.dates
  taskSettings.dates = false
  try {
    assert.deepEqual(sectionTitles(NOTE), ['Fazer', 'Revisão', 'Feito'])
    // Line 7 is the subtask of "Tela", so the selection takes "Tela" whole, then "API".
    const { body, count } = moveTasksToSection(NOTE, 7, 8, 'Feito')
    assert.equal(count, 2)
    assert.match(body, /## Fazer\n\n## Revisão/)
    assert.match(body, /## Feito\n- \[x\] Login\n- \[x\] Tela\n {4}- \[ \] Botão\n- \[x\] API\n/)
    const plain = NOTE.replace('tipo: tarefas', 'tipo: nota')
    const moved = moveTasksToSection(plain, 6, 6, 'Feito').body
    assert.match(moved, /## Feito\n- \[x\] Login\n- \[ \] Tela\n {4}- \[ \] Botão\n/)
    assert.equal(moveTasksToSection(NOTE, 3, 3, 'Feito').count, 0)
  } finally {
    taskSettings.dates = saved
  }
})
