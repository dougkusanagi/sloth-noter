import test from 'node:test'
import assert from 'node:assert/strict'
import { columnBlocks, columnsTemplate, remarkColumns } from './columns.js'
import { markdownTree } from './markdown-model.js'

test('column blocks preserve arbitrary Markdown and whitespace in each column', () => {
  const values = ['Uma linha\n\n- [ ] Tarefa', 'Outra coluna\n\n```js\nconsole.log(1)\n```']
  const text = `# Nota\n\n${columnsTemplate(values)}\n\nDepois`
  const [block] = columnBlocks(text)
  assert.deepEqual(
    block.columns.map((column) => column.text),
    values,
  )
  for (const column of block.columns) assert.equal(text.slice(column.from, column.to), column.text)
})

test('reading keeps Markdown nodes in the column they came from', () => {
  const text = `# Nota\n\n${columnsTemplate(['**Um**', '- Dois'])}`
  const tree = structuredClone(markdownTree(text))
  remarkColumns()(tree, { toString: () => text })
  const group = tree.children.find((node) => node.type === 'columns')
  assert.equal(group.children[0].children[0].children[0].type, 'strong')
  assert.equal(group.children[1].children[0].type, 'list')
})

test('empty columns round trip and invalid or fenced markers are ignored', () => {
  const text = columnsTemplate(['', ''])
  assert.deepEqual(
    columnBlocks(text)[0].columns.map((column) => column.text),
    ['', ''],
  )
  assert.equal(columnBlocks(text.replace('<!-- /sloth:columns -->', '')).length, 0)
  assert.equal(columnBlocks('````\n' + text + '\n````').length, 0)
  assert.equal(
    columnBlocks(
      text.replace(
        '<!-- sloth:column -->',
        'Texto que deve permanecer visível\n\n<!-- sloth:column -->',
      ),
    ).length,
    0,
  )
})
