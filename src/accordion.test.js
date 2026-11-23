import assert from 'node:assert/strict'
import test from 'node:test'
import { accordionBlocks, accordionTemplate } from './accordion.js'
import { documentBlocks } from './block-move.js'

test('a complete accordion is a single movable block', () => {
  const text = '# Nota\n\n' + accordionTemplate('Resumo', 'Parágrafo\n\n- [ ] Item') + '\n\nFora'
  const [block] = accordionBlocks(text)
  assert.equal(
    text.slice(block.from, block.to),
    accordionTemplate('Resumo', 'Parágrafo\n\n- [ ] Item'),
  )
  assert.deepEqual(documentBlocks(text), [
    { first: 3, last: 10, anchor: 4, kind: 'accordion', depth: 0 },
    { first: 12, last: 12, kind: 'p', depth: 0 },
  ])
})

test('code, old HTML and incomplete markers remain ordinary Markdown', () => {
  const valid = accordionTemplate('Título', 'Conteúdo')
  const text =
    '# Nota\n\n```md\n' +
    valid +
    '\n```\n\n<details>\n<summary>Título</summary>\n</details>\n\n<!-- sloth:accordion -->\nSem fechamento'
  assert.deepEqual(accordionBlocks(text), [])
})
