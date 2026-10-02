import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findNote,
  wikiReferences,
  renameWikiReferences,
  imageReferences,
  replaceImageSource,
  remarkWikiLinks,
} from './markdown-model.js'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { inlineSyntax } from './live-markdown.js'

test('wiki links handle aliases, headings, filenames and exclude code, escaped and regular links', () => {
  const text =
    '[[Nota#Seção|rótulo]] [[Outra.md]] `[[código]]` \\[[literal]] [normal](https://example.com)\n\n```\n[[bloco]]\n```'
  assert.deepEqual(
    wikiReferences(text).map((link) => link.target),
    ['Nota#Seção|rótulo', 'Outra.md'],
  )
  assert.equal(findNote([{ name: 'NOTA.md', id: 'one' }], 'nota#Seção|alias').id, 'one')
  assert.equal(renameWikiReferences(text, 'Nota.md', 'Nova.md'), text.replace('Nota#', 'Nova#'))
  const tree = unified()
    .use(remarkParse)
    .use(remarkWikiLinks)
    .runSync(unified().use(remarkParse).parse(text), { value: text })
  assert.equal(tree.children[0].children[0].url, '#sloth-note/Nota%23Se%C3%A7%C3%A3o%7Cr%C3%B3tulo')
})
test('shared parser tracks reference images and rewrites definitions without damaging titles or code', () => {
  const text = '![Foto][image]\n\n[image]: assets/a.png "Título"\n\n`![ignorada](assets/a.png)`'
  const entries = imageReferences(text)
  assert.equal(entries.length, 1)
  assert.equal(entries[0].occurrence.position.start.line, 1)
  assert.equal(
    replaceImageSource(text, 'assets/a.png', 'assets/b.png'),
    text.replace('[image]: assets/a.png', '[image]: assets/b.png'),
  )
  assert.equal(
    inlineSyntax('[link][site]', '[site]: https://example.com')[0].href,
    'https://example.com',
  )
  assert.equal(inlineSyntax('~~riscado~~')[0].kind, 'strike')
})

test('image source normalization protects escaped local filenames and handles replacement metacharacters', async () => {
  const { noteImages } = await import('./images.js')
  const text = '![Foto](assets/a%20b.png)'
  assert.equal(noteImages([{ id: 'one', name: 'a.md', body: text }])[0].src, 'assets/a b.png')
  assert.equal(
    replaceImageSource(text, 'assets/a b.png', 'assets/$photo.png'),
    '![Foto](assets/$photo.png)',
  )
})
