import test from 'node:test'
import assert from 'node:assert/strict'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import { headingSections, remarkSections } from './sections.js'

const DOC = [
  '# Título', // 1
  '', // 2
  'Introdução', // 3
  '## Um', // 4
  'texto', // 5
  '### Um.a', // 6
  'texto', // 7
  '#### Um.a.i', // 8
  'texto', // 9
  '### Um.b', // 10
  '## Dois', // 11
  'texto', // 12
  '#### Pulou', // 13
  'texto', // 14
].join('\n')

test('headings know their nesting level and where their section ends', () => {
  assert.deepEqual(
    headingSections(DOC).map(({ depth, line, level, end }) => [depth, line, level, end]),
    [
      [1, 1, 0, 1],
      [2, 4, 1, 10],
      [3, 6, 2, 9],
      [4, 8, 3, 9],
      [3, 10, 2, 10],
      [2, 11, 1, 14],
      [4, 13, 2, 14],
    ],
  )
})

test('sections know how many rows of subsections they hold', () => {
  assert.deepEqual(
    headingSections(DOC).map((heading) => heading.height),
    [1, 3, 2, 1, 1, 2, 1],
  )
})

test('headings inside code, quotes and lists are not sections', () => {
  const text = '# T\n\n## A\n\n```\n## falso\n```\n\n> ## citado\n\n- ## item\n\ntexto'
  assert.deepEqual(
    headingSections(text).map((heading) => [heading.line, heading.end]),
    [
      [1, 1],
      [3, 13],
    ],
  )
})

test('setext headings count and a note without headings has no sections', () => {
  assert.deepEqual(
    headingSections('Título\n------\ntexto').map((heading) => [heading.level, heading.end]),
    [[1, 3]],
  )
  assert.deepEqual(headingSections('só texto\n\noutro'), [])
})

test('a later H1 closes the open sections', () => {
  assert.deepEqual(
    headingSections('# A\n## B\ntexto\n# C\ntexto').map((h) => [h.level, h.end]),
    [
      [0, 1],
      [1, 3],
      [0, 4],
    ],
  )
})

test('the reading tree nests sections by rank and hoists definitions', () => {
  const text =
    '# T\n\nintro\n\n## A\n\na\n\n### B\n\nb\n\n## C\n\n[x]: https://example.com\n\n[^1]: nota'
  const tree = unified()
    .use(remarkParse)
    .use(remarkSections)
    .runSync(unified().use(remarkParse).use(remarkGfm).parse(text))
  const shape = (node) =>
    node.type === 'section'
      ? { section: node.depth, children: node.children.map(shape) }
      : node.type === 'heading'
        ? `h${node.depth}`
        : node.type
  assert.deepEqual(tree.children.map(shape), [
    'h1',
    'paragraph',
    { section: 2, children: ['h2', 'paragraph', { section: 3, children: ['h3', 'paragraph'] }] },
    { section: 2, children: ['h2'] },
    'definition',
    'footnoteDefinition',
  ])
  assert.deepEqual(tree.children[2].data.hProperties, { className: ['md-section'], dataDepth: 2 })
})
