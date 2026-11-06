import test from 'node:test'
import assert from 'node:assert/strict'
import {
  countEntries,
  countText,
  hubMarkdown,
  releaseList,
  releaseMarkdown,
} from './release-notes.js'

const archive = '## [0.2.0] — 2026-11-06\n\n## [0.1.0] — 2026-10-01\n'
const files = {
  '../../changelog/0.1.0.md':
    '# Sloth Note 0.1.0\n\n> Primeira.\n\n## Adicionado\n\n- a\n- b\n\n## Corrigido\n\n- c\n',
  '../../changelog/0.2.0.md':
    '# Sloth Note 0.2.0\n\n> Segunda.\n\nAdicionado: x\n\nCorrigido: y\n\nCorrigido: z\n',
}
const link = (name, label) => `[[${name}|${label}]]`
const labels = {
  title: 'Novidades',
  hubTitle: 'Novidades',
  intro: 'Intro',
  pendingLabel: 'Em desenvolvimento',
  readLabel: 'Ler',
  backLabel: 'Voltar',
  link,
}

test('counts entries in both changelog formats', () => {
  assert.equal(countText(countEntries(files['../../changelog/0.1.0.md'])), '2 adições · 1 correção')
  assert.equal(countText(countEntries(files['../../changelog/0.2.0.md'])), '1 adição · 2 correções')
})

test('hub lists versions newest first with date, summary, counts and link', () => {
  const releases = releaseList(files, archive, { 'a.md': 'Alterado: pendente' })
  assert.deepEqual(
    releases.map((r) => r.version),
    ['pendente', '0.2.0', '0.1.0'],
  )
  const hub = hubMarkdown(releases, labels)
  assert.match(
    hub,
    /## Versão 0\.2\.0\n\nSegunda\.\n\n\*6 de novembro de 2026 · 1 adição · 2 correções\* · \[\[Sloth Note 0\.2\.0\|Ler\]\]/,
  )
  assert.ok(hub.indexOf('Em desenvolvimento') < hub.indexOf('0.2.0'))
  assert.ok(!hub.includes('- a'))
})

test('a version document keeps its title first and links back to the hub', () => {
  const [, release] = releaseList(files, archive)
  assert.match(
    releaseMarkdown(release, labels),
    /^# Sloth Note 0\.1\.0\n\n\[\[Novidades\|Voltar\]\]\n\n> Primeira\./,
  )
})
