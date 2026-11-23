import test from 'node:test'
import assert from 'node:assert/strict'
import { noteIcon, setNoteIcon } from './note-icon.js'

test('noteIcon reads the emoji at the start of the title, after the properties', () => {
  assert.equal(noteIcon('# 🌱 Horta\n\nTexto'), '🌱')
  assert.equal(noteIcon('---\ntipo: tarefas\n---\n# 👩🏽‍💻 Código\n'), '👩🏽‍💻')
  assert.equal(noteIcon('# 🇧🇷 Viagem\n'), '🇧🇷')
  assert.equal(noteIcon('# Horta 🌱\n'), null)
  assert.equal(noteIcon('# 2026 metas\n'), null)
  assert.equal(noteIcon('Texto\n# 🌱 Depois\n'), null)
})

test('setNoteIcon adds, replaces and removes the icon without touching the rest', () => {
  assert.equal(setNoteIcon('# Horta\n\nTexto', '🌱'), '# 🌱 Horta\n\nTexto')
  assert.equal(setNoteIcon('# 🌱 Horta\n', '🌻'), '# 🌻 Horta\n')
  assert.equal(setNoteIcon('# 🌱 Horta\n', null), '# Horta\n')
  assert.equal(setNoteIcon('---\na: 1\n---\n# Horta\r\nx', '🌱'), '---\na: 1\n---\n# 🌱 Horta\r\nx')
  assert.equal(setNoteIcon('# \n', '🌱'), '# 🌱 \n')
  assert.equal(setNoteIcon('# 🌱 \n', null), '# \n')
  assert.equal(setNoteIcon('Sem título\n', '🌱'), 'Sem título\n')
})
