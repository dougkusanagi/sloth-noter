import test from 'node:test'
import assert from 'node:assert/strict'
import { Text } from '@codemirror/state'
import { fencedPasteInEmptyBlock } from './fenced-paste.js'

test('pasting a fenced snippet into an empty code block keeps one block and its language', () => {
  const doc = Text.of(['Intro', '```', '', '```', 'Fim'])
  const result = fencedPasteInEmptyBlock(
    doc,
    10,
    10,
    '```php\n<?php\n    echo "Testando";\n?>\n```\n',
  )
  assert.deepEqual(result, {
    from: 6,
    to: 14,
    insert: '```php\n<?php\n    echo "Testando";\n?>\n```',
    selection: 42,
  })
})

test('ordinary paste and existing code are left alone', () => {
  const doc = Text.of(['```', 'echo "existing";', '```'])
  assert.equal(fencedPasteInEmptyBlock(doc, 4, 4, '```php\necho 1;\n```'), null)
  const empty = Text.of(['```', '', '```'])
  assert.equal(fencedPasteInEmptyBlock(empty, 4, 4, '<?php echo 1;'), null)
})
