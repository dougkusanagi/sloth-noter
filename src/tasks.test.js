import { test } from 'node:test'
import assert from 'node:assert/strict'
import { noteTasks, sectionProgress, toggleTask } from './tasks.js'

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
