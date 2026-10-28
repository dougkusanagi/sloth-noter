import { applyChanges } from './list-indent.js'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  noteTasks,
  resolvedTasks,
  syncLinkedTasks,
  sectionProgress,
  toggleTask,
  sectionChecklists,
  sectionTaskChanges,
} from './tasks.js'

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

test('section bulk checkboxes include nested tasks, skip fences and stop at sibling headings', () => {
  const body =
    '# Note\n## Work\n- [x] First\n### Child\n- [-] Partial\n- [ ] Open\n```md\n- [ ] Example\n```\n## Other\n- [ ] Outside'
  const section = sectionChecklists(body).get(2)
  assert.deepEqual(
    [section.title, section.done, section.total, section.partial],
    ['Work', 1, 3, true],
  )
  const completed = applyChanges(body, sectionTaskChanges(body, 2, true))
  assert.equal(sectionChecklists(completed).get(2).done, 3)
  assert.ok(completed.includes('- [ ] Example'))
  assert.ok(completed.endsWith('- [ ] Outside'))
  const reset = applyChanges(completed, sectionTaskChanges(completed, 2, false))
  assert.equal(sectionChecklists(reset).get(2).done, 0)
  assert.equal(sectionChecklists(reset).get(2).partial, false)
  assert.deepEqual(sectionTaskChanges(body, 1, true), [])
})

test('section bulk changes leave linked task summaries and their source notes alone', () => {
  const child = { name: 'Child.md', body: '- [ ] Linked' }
  const body = '## Work\n- [ ] [[Child]]\n- [ ] Local'
  const state = sectionChecklists(body, resolvedTasks(body, [child])).get(1)
  assert.equal(state.total, 1)
  assert.equal(
    applyChanges(body, sectionTaskChanges(body, 1, true, [child])),
    '## Work\n- [ ] [[Child]]\n- [x] Local',
  )
  assert.equal(child.body, '- [ ] Linked')
  assert.equal(
    sectionChecklists(
      '## Work\n- [ ] [[Child]]',
      resolvedTasks('## Work\n- [ ] [[Child]]', [child]),
    ).size,
    0,
  )
})

test('section bulk checkboxes support setext and formatted subtitles without changing heading syntax', () => {
  const body = '# Note\n**Work**\n----\n- [ ] A'
  const state = sectionChecklists(body).get(2)
  assert.equal(state.title, 'Work')
  assert.equal(
    applyChanges(body, sectionTaskChanges(body, 2, true)),
    '# Note\n**Work**\n----\n- [x] A',
  )
})

test('wiki headings summarize the referenced document without changing its tasks', () => {
  const notes = [
    {
      name: 'Sistema de Estoque.md',
      body: '# Sistema de Estoque\n\n- [x] Feito\n- [-] Parcial\n- [ ] Pendente',
    },
  ]
  const body = '# Projetos\n\n## [[Sistema de Estoque]]'
  assert.deepEqual(sectionProgress(body, [], new Set(), notes).get(3), { done: 1, total: 3 })
  assert.equal(sectionProgress(body, [], new Set(), []).size, 0)
  assert.deepEqual(
    sectionProgress(body.replace('Estoque]]', 'Estoque|Estoque]]'), [], new Set(), notes).get(3),
    { done: 1, total: 3 },
  )
})

test('a wiki-only heading never borrows local checkboxes for its target summary', () => {
  const body = '# Projetos\n\n## [[Ideias]]\n\n- [ ] Outra tarefa local'
  const notes = [{ name: 'Ideias.md', body: '# Ideias\n\n- Uma ideia sem checkbox' }]
  assert.equal(sectionProgress(body, noteTasks(body), new Set(), notes).has(3), false)
  assert.equal(sectionChecklists(body).has(3), false)
  notes[0].body = '# Ideias\n\n- [x] Feito\n- [ ] Pendente'
  assert.deepEqual(sectionProgress(body, noteTasks(body), new Set(), notes).get(3), {
    done: 1,
    total: 2,
  })
  assert.deepEqual(sectionTaskChanges(body, 3, true, notes), [])
})
