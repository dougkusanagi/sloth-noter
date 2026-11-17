import test from 'node:test'
import assert from 'node:assert/strict'
import {
  frontmatterEnd,
  propertyMap,
  readProperties,
  splitFrontmatter,
  titleEnd,
  titleLineNumber,
  writeProperty,
} from './frontmatter.js'

const note =
  '---\nresponsavel: Ana\nprazo: 2026-12-01\n# um comentário\ntags:\n  - a\n  - b\n---\n# Título\n\nTexto'

test('frontmatterEnd finds the closing fence and ignores lookalikes', () => {
  assert.equal(note.slice(frontmatterEnd(note)), '# Título\n\nTexto')
  assert.equal(frontmatterEnd('# Título\n\n---\na: 1\n---\n'), 0)
  assert.equal(frontmatterEnd('---\na: 1\n'), 0)
  assert.equal(frontmatterEnd('--- x\na: 1\n---\n'), 0)
  assert.equal(frontmatterEnd('---\r\na: 1\r\n---\r\n# T'), 16)
  assert.equal(frontmatterEnd('---\na: 1\n...\n# T'), 13)
  assert.equal(frontmatterEnd('---\n---\n# T'), 8)
})

test('splitFrontmatter and titleEnd work after the block', () => {
  const parts = splitFrontmatter(note)
  assert.ok(parts.raw.startsWith('---\n') && parts.raw.endsWith('---\n'))
  assert.ok(parts.yaml.startsWith('responsavel: Ana'))
  assert.equal(parts.body, '# Título\n\nTexto')
  assert.equal(note.slice(0, titleEnd(note)).endsWith('# Título'), true)
  assert.equal(titleEnd('# Só título'), 11)
  assert.deepEqual(splitFrontmatter('# T'), { raw: '', yaml: null, body: '# T' })
})

test('readProperties types text, numbers, booleans, dates, lists and empty values', () => {
  const result = readProperties(
    '---\nnome: Ana\nidade: 30\nativo: true\nprazo: 2026-12-01\ntags: [a, b]\nvazio:\nobjeto:\n  x: 1\n---\n# T',
  )
  assert.equal(result.ok, true)
  assert.deepEqual(
    result.entries.map((entry) => [entry.key, entry.type]),
    [
      ['nome', 'text'],
      ['idade', 'number'],
      ['ativo', 'boolean'],
      ['prazo', 'date'],
      ['tags', 'list'],
      ['vazio', 'empty'],
      ['objeto', 'unsupported'],
    ],
  )
  assert.deepEqual(readProperties('# T').entries, [])
  assert.equal(readProperties('# T').hasBlock, false)
})

test('readProperties keeps accents and rejects duplicate keys, aliases, bad YAML and big blocks', () => {
  assert.equal(readProperties('---\nresponsável: João\n---\n# T').entries[0].value, 'João')
  assert.equal(readProperties('---\na: 1\na: 2\n---\n# T').error.code, 'duplicateKey')
  assert.equal(readProperties('---\na: &x 1\nb: *x\n---\n# T').error.code, 'alias')
  assert.equal(readProperties('---\na: [1, 2\n---\n# T').error.code, 'invalid')
  assert.equal(readProperties('---\n- a\n- b\n---\n# T').error.code, 'notMap')
  assert.equal(readProperties(`---\na: ${'x'.repeat(70000)}\n---\n# T`).error.code, 'tooLarge')
  assert.equal(readProperties('---\n---\n# T').ok, true)
})

test('propertyMap leaves out unsupported and empty values', () => {
  const map = propertyMap('---\na: 1\nb:\nc:\n  d: 1\n---\n# T')
  assert.deepEqual([...map.keys()], ['a'])
})

test('writeProperty keeps comments and order, adds, replaces and removes', () => {
  const replaced = writeProperty(note, 'responsavel', 'Bia')
  assert.ok(replaced.includes('responsavel: Bia'))
  assert.ok(replaced.includes('# um comentário'))
  assert.ok(replaced.endsWith('# Título\n\nTexto'))
  const added = writeProperty(note, 'projeto', 'Site novo')
  assert.ok(added.includes('projeto: Site novo'))
  assert.ok(added.indexOf('tags:') < added.indexOf('projeto:'))
  const removed = writeProperty(note, 'prazo', undefined)
  assert.ok(!removed.includes('prazo'))
  assert.ok(removed.includes('# um comentário'))
  const created = writeProperty('# T\n\nTexto', 'autor', 'Ana')
  assert.equal(created, '---\nautor: Ana\n---\n# T\n\nTexto')
  assert.equal(writeProperty('---\na: [1\n---\n# T', 'b', 1), null)
  assert.equal(writeProperty('# T', 'x', undefined), '# T')
})

test('titleLineNumber follows the YAML block of an editor document', async () => {
  const { Text } = await import('@codemirror/state')
  assert.equal(titleLineNumber(Text.of(['# T', 'x'])), 1)
  assert.equal(titleLineNumber(Text.of(['---', 'a: 1', '---', '# T'])), 4)
  assert.equal(titleLineNumber(Text.of(['---', 'a: 1', '# T'])), 1)
  assert.equal(titleLineNumber(Text.of(['---', 'a: 1', '---'])), 4)
})
