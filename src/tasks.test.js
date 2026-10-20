import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteTasks, resolvedTasks, syncLinkedTasks, sectionProgress, toggleTask } from './tasks.js'

const BODY = `# Lista

## Estoque

- [x] Corrigir sacos
- [ ] Remover produtos
    - [ ] Subtarefa

\`\`\`
- [ ] não é tarefa
\`\`\`

### Ideias

1. [X] Filtros

## Vazia

Texto`

test('noteTasks finds tasks outside code fences with their positions', () => {
  const tasks = noteTasks(BODY)
  assert.deepEqual(
    tasks.map(({ line, done, text, depth }) => [line, done, text, depth]),
    [
      [5, true, 'Corrigir sacos', 0],
      [6, false, 'Remover produtos', 0],
      [7, false, 'Subtarefa', 4],
      [15, true, 'Filtros', 0],
    ],
  )
  for (const task of tasks) assert.match(BODY[task.mark], /[ xX]/)
  assert.equal(BODY.slice(tasks[1].offset).split('\n')[0], '- [ ] Remover produtos')
})

test('toggleTask flips only the box', () => {
  const [first, second] = noteTasks(BODY)
  assert.equal(noteTasks(toggleTask(BODY, first.mark))[0].done, false)
  assert.equal(noteTasks(toggleTask(BODY, second.mark))[1].done, true)
  assert.equal(toggleTask(BODY, 0), BODY)
})

test('sectionProgress counts tasks of a section and its subsections', () => {
  const progress = sectionProgress(BODY)
  assert.deepEqual(progress.get(3), { done: 2, total: 4 })
  assert.deepEqual(progress.get(13), { done: 1, total: 1 })
  assert.equal(progress.has(17), false)
  assert.equal(sectionProgress('# Só título').size, 0)
})

test('expanded ancestors omit a total belonging entirely to one nested section', () => {
  const body = '# T\n## Parent\n### Child\n##### Deep\n###### Tasks\n- [ ] A\n- [x] B\n## Empty'
  assert.deepEqual([...sectionProgress(body)], [[5, { done: 1, total: 2 }]])
  assert.deepEqual(
    [...sectionProgress(body, undefined, new Set([2]))],
    [
      [2, { done: 1, total: 2 }],
      [5, { done: 1, total: 2 }],
    ],
  )
})

test('parents summarize multiple task-bearing branches, including through empty wrappers', () => {
  const body = '## Parent\n### Wrapper A\n#### A\n- [x] A\n### Wrapper B\n#### B\n- [ ] B'
  assert.deepEqual(
    [...sectionProgress(body)],
    [
      [1, { done: 1, total: 2 }],
      [3, { done: 1, total: 1 }],
      [6, { done: 0, total: 1 }],
    ],
  )
})

test('an empty sibling does not make a repeated parent total useful', () => {
  const body = '## Parent\n### Tasks\n- [ ] A\n### Empty\nText\n## Other\n- [x] B'
  assert.deepEqual(
    [...sectionProgress(body)],
    [
      [2, { done: 0, total: 1 }],
      [6, { done: 1, total: 1 }],
    ],
  )
})

test('partial tasks remain open and toggling completes them', () => {
  const body = '- [-] In progress\n1. [-] Another\n- [x] Done'
  assert.deepEqual(
    noteTasks(body).map(({ done, partial }) => [done, partial]),
    [
      [false, true],
      [false, true],
      [true, false],
    ],
  )
  assert.equal(noteTasks(toggleTask(body, 3))[0].done, true)
  assert.deepEqual(sectionProgress('## Work\n' + body).get(1), { done: 1, total: 3 })
})

test('linked tasks track progress, headings, aliases and nested notes', () => {
  const notes = [
    { name: 'Child.md', body: '## Work\n- [x] One\n- [-] Two\n## Later\n- [ ] Three' },
    { name: 'Parent.md', body: '- [ ] [[Child#Work|Label]]' },
  ]
  const [task] = resolvedTasks(notes[1].body, notes)
  assert.deepEqual(task.progress, { done: 1, total: 2 })
  assert.equal(task.partial, true)
  const synced = syncLinkedTasks(notes.map((note) => ({ ...note, revision: 0 })))
  assert.equal(synced[1].body, '- [-] [[Child#Work|Label]]')
  const completed = synced.map((note, i) =>
    i === 0 ? { ...note, body: note.body.replace('[-]', '[x]') } : note,
  )
  assert.equal(syncLinkedTasks(completed)[1].body, '- [x] [[Child#Work|Label]]')
  completed[0].body = completed[0].body.replace('[x]', '[ ]')
  assert.equal(syncLinkedTasks(completed)[1].body, '- [-] [[Child#Work|Label]]')
  assert.equal(resolvedTasks('- [ ] [[Parent]]', completed)[0].done, false)
})

test('missing, empty and circular references keep manual state', () => {
  assert.equal(resolvedTasks('- [-] [[Missing]]', [])[0].partial, true)
  assert.equal(
    resolvedTasks('- [x] [[Empty]]', [{ name: 'Empty.md', body: '# Empty' }])[0].done,
    true,
  )
  const notes = [
    { name: 'A.md', body: '- [x] [[B]]', revision: 0 },
    { name: 'B.md', body: '- [ ] [[A]]', revision: 0 },
  ]
  assert.deepEqual(syncLinkedTasks(notes), notes)
})
