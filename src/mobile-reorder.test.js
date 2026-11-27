import { test } from 'node:test'
import assert from 'node:assert/strict'
import { moveBlockTo, reorderItems } from './mobile/reorder-blocks.js'

const NOTE = `# Lista

## Mercado

- [ ] Arroz
- [x] Feijão
    - [ ] Carioca

Um parágrafo.`

test('reorderItems lists blocks with readable labels and task state', () => {
  const items = reorderItems(NOTE)
  assert.deepEqual(
    items.map((item) => [item.kind, item.label, item.done]),
    [
      ['h2', 'Mercado', undefined],
      ['task', 'Arroz', false],
      ['task', 'Feijão', true],
      ['p', 'Um parágrafo.', undefined],
    ],
  )
  assert.equal(items[2].lines, 2)
})

test('moveBlockTo swaps tasks inside one list and keeps nested items with their parent', () => {
  assert.equal(
    moveBlockTo(NOTE, 2, 1),
    `# Lista

## Mercado

- [x] Feijão
    - [ ] Carioca
- [ ] Arroz

Um parágrafo.`,
  )
})

test('moveBlockTo moves a block down to the end and up to the top', () => {
  assert.equal(
    moveBlockTo(NOTE, 0, 3),
    `# Lista

- [ ] Arroz
- [x] Feijão
    - [ ] Carioca

Um parágrafo.

## Mercado`,
  )
  const up = moveBlockTo(NOTE, 3, 0)
  assert.ok(up.startsWith('# Lista\n\nUm parágrafo.\n\n## Mercado'))
})

test('moveBlockTo ignores moves that change nothing', () => {
  assert.equal(moveBlockTo(NOTE, 1, 1), null)
  assert.equal(moveBlockTo(NOTE, 0, -1), null)
  assert.equal(moveBlockTo(NOTE, 3, 4), null)
})

test('reorderItems treats status boxes as tasks', () => {
  const [item] = reorderItems('# T\n\n- [/] Conferir notas')
  assert.deepEqual([item.kind, item.label, item.done], ['task', 'Conferir notas', false])
})
