import test from 'node:test'
import assert from 'node:assert/strict'
import { activeFormats, formatSelection } from './format-selection.js'

test('applies inline Markdown around selected text', () => {
  assert.deepEqual(formatSelection('um teste aqui', 3, 8, 'bold'), {
    from: 3,
    to: 8,
    insert: '**teste**',
    selectionFrom: 5,
    selectionTo: 10,
  })
  assert.deepEqual(formatSelection('teste', 0, 5, 'link', 'https://exemplo.com'), {
    from: 0,
    to: 5,
    insert: '[teste](https://exemplo.com)',
    selectionFrom: 1,
    selectionTo: 6,
  })
})

test('formats complete selected lines', () => {
  assert.deepEqual(formatSelection('um\ndois\ntrês', 4, 7, 'quote'), {
    from: 3,
    to: 7,
    insert: '> dois',
    selectionFrom: 6,
    selectionTo: 9,
  })
  assert.deepEqual(formatSelection('um\ndois\ntrês', 4, 11, 'list'), {
    from: 3,
    to: 12,
    insert: '- dois\n- três',
    selectionFrom: 6,
    selectionTo: 15,
  })
})

test('ignores empty selections and unknown actions', () => {
  assert.equal(formatSelection('teste', 2, 2, 'bold'), null)
  assert.equal(formatSelection('teste', 0, 5, 'unknown'), null)
  assert.equal(formatSelection('teste', 0, 5, 'link', 'javascript:alert(1)'), null)
})

test('detects and removes inline styles, including nested styles', () => {
  const text = '**`negrito`** e [site](https://example.com)'
  assert.deepEqual(activeFormats(text, 3, 10), ['bold', 'code'])
  assert.deepEqual(formatSelection(text, 3, 10, 'bold'), {
    from: 0,
    to: 13,
    insert: '`negrito`',
    selectionFrom: 1,
    selectionTo: 8,
  })
  assert.deepEqual(activeFormats(text, 17, 21), ['link'])
  assert.deepEqual(formatSelection(text, 17, 21, 'link'), {
    from: 16,
    to: 43,
    insert: 'site',
    selectionFrom: 16,
    selectionTo: 20,
  })
  assert.deepEqual(activeFormats('[site](javascript:alert)', 1, 5), [])
})

test('detects and removes block styles across selected lines', () => {
  const text = '## Um\n## Dois\nFim'
  assert.deepEqual(activeFormats(text, 3, 12), ['heading'])
  assert.deepEqual(formatSelection(text, 3, 12, 'heading'), {
    from: 0,
    to: 13,
    insert: 'Um\nDois',
    selectionFrom: 0,
    selectionTo: 6,
  })
})
