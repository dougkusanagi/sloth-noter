import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addBoardTask,
  columnOf,
  dropCard,
  moveCardToLane,
  parseBoard,
  setCardStatus,
  setCardText,
} from './task-board.js'

const BODY = [
  '# Projeto',
  '',
  '## Backend',
  '',
  '- [x] API',
  '- [/] Cache',
  '    - [ ] Redis',
  '    nota',
  '- [-] Fila',
  '',
  '## Frontend',
  '',
  '- [ ] Tela',
  '',
  '```md',
  '- [ ] Exemplo',
  '```',
  '',
  '## Arquivo',
  '',
  '- [x] Velha',
  '',
].join('\n')

test('lanes are the H2 sections; cards are top-level tasks with their subtasks', () => {
  const { lanes } = parseBoard(BODY)
  assert.deepEqual(
    lanes.map((lane) => [lane.title, lane.cards.map((card) => [card.text, card.status])]),
    [
      [
        'Backend',
        [
          ['API', 'done'],
          ['Cache', 'doing'],
          ['Fila', 'canceled'],
        ],
      ],
      ['Frontend', [['Tela', 'todo']]],
    ],
  )
  assert.deepEqual(lanes[0].cards[1].children, [{ text: 'Redis', status: 'todo' }])
  assert.equal(columnOf('canceled'), 'done')
})

test('tasks before any H2 form an implicit lane, which is the only one in a flat note', () => {
  const flat = parseBoard('# T\n\n- [ ] a\n- [x] b\n')
  assert.deepEqual(
    flat.lanes.map((lane) => [lane.title, lane.cards.length]),
    [['', 2]],
  )
  assert.deepEqual(
    parseBoard('# T\n\nsó texto\n').lanes.map((lane) => lane.cards.length),
    [0],
  )
})

test('setCardStatus changes the box and the card keeps its subtasks', () => {
  const [, doing] = parseBoard(BODY).lanes[0].cards
  const next = setCardStatus(BODY, doing.mark, 'waiting')
  assert.ok(next.includes('- [>] Cache\n    - [ ] Redis\n    nota'))
})

test('moveCardToLane moves the whole block to the end of the other lane', () => {
  const [, doing] = parseBoard(BODY).lanes[0].cards
  const next = moveCardToLane(BODY, doing.mark, 'Frontend')
  assert.ok(next.includes('```\n\n- [/] Cache\n    - [ ] Redis\n    nota\n\n## Arquivo'))
  assert.ok(next.includes('- [x] API\n- [-] Fila\n\n## Frontend'))
  assert.ok(next.includes('## Arquivo\n\n- [x] Velha'))
  assert.equal(moveCardToLane(BODY, 12345, 'Frontend'), BODY)
})

test('addBoardTask puts the task at the end of the lane with the column status', () => {
  const next = addBoardTask(BODY, 'Backend', 'waiting', '  Nova   tarefa ')
  assert.ok(next.includes('- [-] Fila\n- [>] Nova tarefa\n\n## Frontend'))
  assert.equal(addBoardTask(BODY, 'Backend', 'todo', '   '), BODY)
  assert.equal(addBoardTask('# T\n', '', 'todo', 'a'), '# T\n\n- [ ] a\n')
  const flat = addBoardTask('# T\n\n- [ ] a\n', '', 'doing', 'b')
  assert.equal(flat, '# T\n\n- [ ] a\n- [/] b\n')
  const withArchive = addBoardTask('# T\n\n## Arquivo\n\n- [x] a\n', '', 'todo', 'n')
  assert.ok(withArchive.indexOf('- [ ] n') < withArchive.indexOf('## Arquivo'))
})

const card = (body, text) =>
  parseBoard(body)
    .lanes.flatMap((lane) => lane.cards)
    .find((item) => item.text === text)

test('dropCard places the whole block right before the target card', () => {
  const next = dropCard(BODY, card(BODY, 'Fila').mark, { before: card(BODY, 'API').mark })
  assert.match(
    next,
    /## Backend\n\n- \[-\] Fila\n- \[x\] API\n- \[\/\] Cache\n {4}- \[ \] Redis\n {4}nota\n/,
  )
})

test('dropCard moves a card with its subtasks before a card of another lane and sets the column', () => {
  const next = dropCard(BODY, card(BODY, 'Cache').mark, {
    status: 'waiting',
    before: card(BODY, 'Tela').mark,
  })
  assert.match(next, /## Frontend\n\n- \[>\] Cache\n {4}- \[ \] Redis\n {4}nota\n- \[ \] Tela/)
  assert.ok(!/## Backend[^#]*Cache/.test(next))
})

test('dropCard at the end of a lane, and unknown cards, are handled', () => {
  const next = dropCard(BODY, card(BODY, 'API').mark, { laneTitle: 'Backend' })
  assert.match(next, /- \[-\] Fila\n- \[x\] API\n/)
  assert.equal(dropCard(BODY, 999999, { laneTitle: 'Backend' }), BODY)
  const same = dropCard(BODY, card(BODY, 'Fila').mark, { laneTitle: 'Backend' })
  assert.equal(same, BODY)
})

test('setCardText keeps the marker, the box and the subtasks', () => {
  const next = setCardText(BODY, card(BODY, 'Cache').mark, '  Cache   Redis ')
  assert.ok(next.includes('- [/] Cache Redis\n    - [ ] Redis\n'))
  assert.equal(setCardText(BODY, card(BODY, 'Cache').mark, '   '), BODY)
})
