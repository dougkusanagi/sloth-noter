import test from 'node:test'
import assert from 'node:assert/strict'
import { continueBlock } from './continue-block.js'

test('continues unordered and ordered lists and quotes', () => {
  assert.deepEqual(continueBlock('- item', 6), { from: 6, to: 6, insert: '\n- ', cursor: 9 })
  assert.deepEqual(continueBlock('9. item', 7), { from: 7, to: 7, insert: '\n10. ', cursor: 12 })
  assert.deepEqual(continueBlock('> texto', 7), { from: 7, to: 7, insert: '\n> ', cursor: 10 })
})

test('empty item ends a list or quote', () => {
  assert.deepEqual(continueBlock('- item\n- ', 9), { from: 7, to: 9, insert: '', cursor: 7 })
  assert.deepEqual(continueBlock('> ', 2), { from: 0, to: 2, insert: '', cursor: 0 })
})

test('leaves middle of lines and fenced code alone', () => {
  assert.equal(continueBlock('- item', 3), null)
  assert.equal(continueBlock('```\n- item\n```', 10), null)
})

test('completed tasks continue with an unchecked task and an empty task exits the list', () => {
  const body = '  - [x] feito'
  assert.equal(continueBlock(body, body.length).insert, '\n  - [ ] ')
  assert.equal(continueBlock('- [ ] ', 6).insert, '')
})

test('task continuation leaves tilde fences and indented code unchanged', () => {
  const fenced = '~~~\n- [ ] literal\n~~~'
  assert.equal(continueBlock(fenced, fenced.indexOf('\n~~~')), null)
  const indented = '    - [ ] literal'
  assert.equal(continueBlock(indented, indented.length), null)
})

test('Enter in a paragraph starts a new paragraph', () => {
  const end = continueBlock('# Nota\n\nTexto', 13)
  assert.deepEqual(end, { from: 13, to: 13, insert: '\n\n', cursor: 15 })
  assert.equal(continueBlock('# Nota\n\nTexto aqui', 14).insert, '\n\n')
  assert.equal(continueBlock('# Nota\n\nUm\ndois', 15).insert, '\n\n')
  assert.equal(continueBlock('# Nota\n\n', 8), null)
  assert.equal(continueBlock('# Nota', 6), null)
})

test('Enter at the start of a paragraph line keeps the plain line break', () => {
  assert.equal(continueBlock('# Título\nCorpo', 9), null)
  assert.equal(continueBlock('# Título\n\nCorpo', 10), null)
})

test('Enter at the start of a paragraph adds an empty paragraph above it', () => {
  const text = '# Nota\n\n## Seção\nteste'
  const position = text.indexOf('teste')
  assert.deepEqual(continueBlock(text, position), {
    from: position,
    to: position,
    insert: '\n\n\n',
    cursor: position + 3,
  })
  // With the empty line already there, two more breaks: gap, empty paragraph, gap.
  const apart = '# Nota\n\n## Seção\n\nteste'
  assert.equal(continueBlock(apart, apart.indexOf('teste')).insert, '\n\n')
  // A line inside the paragraph is split as usual, with a plain line break.
  assert.equal(continueBlock('# Nota\n\nUm\ndois', 11), null)
})

test('Enter after a closing fence starts a new paragraph below the code block', () => {
  const text = '```js\nx\n```'
  assert.deepEqual(continueBlock(text, text.length), {
    from: text.length,
    to: text.length,
    insert: '\n\n',
    cursor: text.length + 2,
  })
  assert.equal(continueBlock('~~~\nx\n~~~\n\nabc', 9).insert, '\n\n')
  assert.equal(continueBlock('```', 3), null)
  assert.equal(continueBlock('```\nx', 5), null)
})

// Regression: the arrow keys leave the cursor at the start of the closing fence, and Enter there
// added a line to the code instead of a paragraph below it.
test('Enter anywhere on the closing fence starts a paragraph below the code block', () => {
  const text = '# Nota\n\n```js\nx\n```\n\ndepois'
  const fence = text.lastIndexOf('```')
  assert.deepEqual(continueBlock(text, fence), {
    from: fence + 3,
    to: fence + 3,
    insert: '\n\n',
    cursor: fence + 5,
  })
  assert.equal(continueBlock(text, fence + 1).from, fence + 3)
  // The last line of code is still code: Enter there adds a code line.
  assert.equal(continueBlock(text, text.indexOf('x\n') + 1), null)
})

test('Enter at the start of a code block adds an empty paragraph above it', () => {
  const text = '# Nota\n\nantes\n\n```\nx\n```'
  const start = text.indexOf('```')
  assert.deepEqual(continueBlock(text, start), {
    from: start,
    to: start,
    insert: '\n\n',
    cursor: start + 2,
  })
})
