import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findNote,
  wikiReferences,
  renameWikiReferences,
  imageReferences,
  noteReferences,
  markdownTree,
  replaceImageSource,
  remarkWikiLinks,
  remarkTags,
} from './markdown-model.js'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { inlineSyntax } from './live-markdown.js'

test('library references survive tree cache eviction while another note is edited', () => {
  const notes = Array.from({ length: 36 }, (_, index) => ({
    id: String(index),
    body: `# Projeto ${index}\n\n[[Destino#Etapa|Abrir]]\n\n![Foto][image]\n\n[image]: assets/${index}.png`,
  }))
  const references = notes.map(noteReferences)
  for (let revision = 0; revision < 20; revision++) {
    markdownTree(`# Nota em edição\n\n${'a'.repeat(revision)}`)
    for (const [index, note] of notes.entries()) {
      assert.equal(noteReferences(note), references[index])
      assert.equal(noteReferences(note).wiki[0].target, 'Destino#Etapa|Abrir')
      assert.equal(noteReferences(note).images[0].src, `assets/${index}.png`)
    }
  }
  const renamed = renameWikiReferences(notes[0].body, 'Destino.md', 'Novo.md', references[0].wiki)
  assert.equal(renamed, notes[0].body.replace('Destino#', 'Novo#'))
  assert.equal(noteReferences(notes[0]), references[0])
  assert.equal(noteReferences(notes[0]).wiki[0].target, 'Destino#Etapa|Abrir')
})

test('edited references update their targets and offsets without changing untouched notes', () => {
  const original = { id: 'one', body: '# Nota\n\n[[Antes]]\n\n![Foto](assets/antes.png)' }
  const previous = noteReferences(original)
  const edited = {
    ...original,
    body: '# Nota\n\nTexto novo\n\n[[Depois]]\n\n![Foto](assets/depois.png)',
  }
  const references = noteReferences(edited)
  assert.equal(references.wiki[0].target, 'Depois')
  assert.equal(references.wiki[0].start, edited.body.indexOf('[[Depois]]'))
  assert.equal(references.images[0].src, 'assets/depois.png')
  assert.equal(references.images[0].node.position.start.offset, edited.body.indexOf('![Foto]'))
  assert.equal(noteReferences(original), previous)
  edited.body = '# Nota sem referências'
  assert.deepEqual(noteReferences(edited), { wiki: [], images: [] })
})

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

test('reading view wraps tags but not code, links, words with a hash or headings marks', () => {
  const text =
    '#ideia e #projeto/lista, C# e palavra#nao `#código` [#link](https://example.com) [[Nota#Seção]]'
  const tree = unified()
    .use(remarkParse)
    .use(remarkWikiLinks)
    .use(remarkTags)
    .runSync(unified().use(remarkParse).parse(text), { value: text })
  const tags = []
  const visit = (node) => {
    if (node.data?.hProperties?.className?.includes('markdown-tag'))
      tags.push(node.children[0].value)
    node.children?.forEach(visit)
  }
  visit(tree)
  assert.deepEqual(tags, ['#ideia', '#projeto/lista'])
  assert.equal(tree.children[0].children[0].data.hName, 'span')
})
