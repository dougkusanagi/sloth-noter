import test from 'node:test'
import assert from 'node:assert/strict'
import { displayName, notePreview } from './note-title.js'
import { setLanguage } from './i18n.js'

test('Markdown syntax at the start of a note name is not shown', () => {
  setLanguage('pt-BR')
  assert.equal(displayName('- [ ] Criar 2 artes.md'), 'Criar 2 artes')
  assert.equal(displayName('1. Modelista (Felipe).md'), 'Modelista (Felipe)')
  assert.equal(displayName('![[Pasted image 2026.png]].md'), 'Pasted image 2026.png')
  assert.equal(displayName('# Título.md', true), 'Título.md')
  assert.equal(displayName('Opções- ✅ ❌.md'), 'Opções- ✅ ❌')
})

test('names with nothing readable fall back to a placeholder', () => {
  setLanguage('pt-BR')
  assert.equal(displayName('- [-] -.md'), 'Sem título')
  assert.equal(displayName('```.md'), 'Sem título')
  setLanguage('en')
  assert.equal(displayName('```.md'), 'Untitled')
  setLanguage('pt-BR')
})

test('the preview is the first readable line after the title, without Markdown', () => {
  assert.equal(
    notePreview('# Título\n\n**Negrito** e [link](http://x.y) aqui'),
    'Negrito e link aqui',
  )
  assert.equal(notePreview('# Título\n\n- [ ] tarefa pendente'), 'tarefa pendente')
  assert.equal(notePreview('# Só título\n\n'), '')
  assert.equal(notePreview('sem título\nsegunda'), 'sem título')
  assert.ok(notePreview(`# T\n${'a'.repeat(200)}`).endsWith('…'))
})
