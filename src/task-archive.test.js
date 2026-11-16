import { test } from 'node:test'
import assert from 'node:assert/strict'
import { archiveClosedTasks, unarchiveTask } from './task-archive.js'
import { noteTasks } from './tasks.js'

test('moves done and canceled tasks under a group named after their section', () => {
  const body =
    '# Projeto\n\n## Backend\n\n- [x] API\n- [ ] Cache\n- [-] Fila\n\n## Frontend\n\n- [x] Tela\n'
  const { body: result, count } = archiveClosedTasks(body)
  assert.equal(count, 3)
  assert.equal(
    result,
    '# Projeto\n\n## Backend\n\n- [ ] Cache\n\n## Frontend\n\n## Arquivo\n\n### Backend\n\n- [x] API\n- [-] Fila\n\n### Frontend\n\n- [x] Tela\n',
  )
})

test('only moves a task when it and every subtask are closed, with indented lines', () => {
  const body =
    '## Work\n\n- [x] Pai\n    descrição\n    - [x] Filho\n- [x] Outro\n    - [ ] Aberta\n- [ ] Aberto\n    - [x] Fechado dentro\n'
  const { body: result, count } = archiveClosedTasks(body)
  assert.equal(count, 2)
  assert.equal(
    result,
    '## Work\n\n- [x] Outro\n    - [ ] Aberta\n- [ ] Aberto\n    - [x] Fechado dentro\n\n## Arquivo\n\n### Work\n\n- [x] Pai\n    descrição\n    - [x] Filho\n',
  )
})

test('ignores code fences, keeps tasks without a section at the start of the archive', () => {
  const body = '# T\n\n- [x] Solta\n\n## A\n\n```md\n- [x] Exemplo\n```\n'
  const { body: result, count } = archiveClosedTasks(body)
  assert.equal(count, 1)
  assert.equal(result, '# T\n\n## A\n\n```md\n- [x] Exemplo\n```\n\n## Arquivo\n\n- [x] Solta\n')
})

test('reuses an existing archive, in any language, appending to matching groups', () => {
  const body = '## A\n\n- [x] Nova\n\n## Archive\n\n### A\n\n- [x] Velha\n\n### B\n\n- [x] Outra\n'
  const { body: result, count } = archiveClosedTasks(body, 'Arquivo')
  assert.equal(count, 1)
  assert.equal(
    result,
    '## A\n\n## Archive\n\n### A\n\n- [x] Velha\n- [x] Nova\n\n### B\n\n- [x] Outra\n',
  )
  assert.equal(archiveClosedTasks(result).count, 0)
})

test('does nothing when no task is finished and never touches the archive itself', () => {
  const body = '## A\n\n- [ ] Aberta\n\n## Arquivo\n\n### A\n\n- [x] Feita\n'
  const archived = archiveClosedTasks(body)
  assert.equal(archived.count, 0)
  assert.equal(archived.body, body)
})

test('archived tasks are flagged and leave the progress', () => {
  const body = '## A\n\n- [ ] Aberta\n\n## Arquivo\n\n### A\n\n- [x] Feita\n'
  assert.deepEqual(
    noteTasks(body).map((task) => task.archived),
    [false, true],
  )
})

test('unarchive returns the task to its section, or before the archive when it is gone', () => {
  const body =
    '## A\n\n- [ ] Aberta\n\n## B\n\n- [ ] Outra\n\n## Arquivo\n\n### A\n\n- [x] Feita\n\n### Sumiu\n\n- [x] Velha\n'
  const [, , feita, velha] = noteTasks(body)
  const back = unarchiveTask(body, feita.mark)
  assert.equal(
    back,
    '## A\n\n- [ ] Aberta\n- [x] Feita\n\n## B\n\n- [ ] Outra\n\n## Arquivo\n\n### Sumiu\n\n- [x] Velha\n',
  )
  const lost = unarchiveTask(back, noteTasks(back).at(-1).mark)
  assert.equal(
    lost,
    '## A\n\n- [ ] Aberta\n- [x] Feita\n\n## B\n\n- [ ] Outra\n\n- [x] Velha\n\n## Arquivo\n',
  )
  assert.equal(unarchiveTask(body, velha.mark).includes('## Arquivo'), true)
  assert.equal(unarchiveTask(body, 0), body)
})

test('blank lines inside code blocks survive archiving and unarchiving', () => {
  const fence = '```'
  const code = [fence, 'a', '', '', 'b', fence].join('\n')
  const body = ['## A', '', '- [x] Feita', '', code, ''].join('\n')
  const { body: archived } = archiveClosedTasks(body)
  assert.ok(archived.includes(code))
  const [task] = noteTasks(archived)
  assert.ok(unarchiveTask(archived, task.mark).includes(code))
})
