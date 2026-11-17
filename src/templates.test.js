import test from 'node:test'
import assert from 'node:assert/strict'
import {
  renderTemplate,
  setTemplateProfile,
  templateInsertEdit,
  templateList,
} from './templates.js'

const now = new Date(2026, 10, 16, 14, 30)

test('renderTemplate fills the variables and reports the cursor', () => {
  const result = renderTemplate(
    '# {{title}}\n{{date}} {{time}} {{date:YYYY-MM-DD}}\n{{cursor}}fim',
    {
      title: 'Site',
      now,
    },
  )
  assert.equal(result.text, '# Site\n16/11/2026 14:30 2026-11-16\nfim')
  assert.equal(result.cursor, result.text.indexOf('fim'))
})

test('renderTemplate keeps unknown variables and puts the cursor at the end without a marker', () => {
  const result = renderTemplate('{{nome}} {{title:x}}', { now })
  assert.equal(result.text, '{{nome}} {{title:x}}')
  assert.equal(result.cursor, result.text.length)
})

test('renderTemplate formats the date for the English language', () => {
  assert.equal(renderTemplate('{{date}}', { now, language: 'en' }).text, '11/16/2026')
})

test('every built-in template has a title line, a unique id and the same set in both languages', () => {
  const pt = templateList('pt-BR')
  const en = templateList('en')
  assert.deepEqual(
    pt.map((item) => item.id),
    en.map((item) => item.id),
  )
  for (const item of [...pt, ...en]) {
    assert.match(item.body, /^# .+/)
    assert.ok(item.label && item.description)
    assert.equal(item.body.split('{{cursor}}').length - 1, 1)
  }
})

test('built-in templates have no sample content, HTML or instruction blocks', () => {
  for (const item of [...templateList('pt-BR'), ...templateList('en')]) {
    assert.doesNotMatch(item.body, /<[a-z/]/i)
    assert.doesNotMatch(item.body, /- \[[/>x-]\]/)
    assert.doesNotMatch(item.body, /\n\n\n/)
  }
})

test('renderTemplate supports date offsets and the weekday', () => {
  assert.equal(renderTemplate('{{date+7d}} {{date-1d}}', { now }).text, '23/11/2026 15/11/2026')
  assert.equal(renderTemplate('{{weekday}}', { now }).text, 'segunda-feira')
  assert.equal(renderTemplate('{{weekday}}', { now, language: 'en' }).text, 'Monday')
  assert.equal(renderTemplate('{{weekday+1d}}', { now }).text, '{{weekday+1d}}')
})

test('templateInsertEdit drops the title line, separates blocks and places the cursor', () => {
  const text = '# Site\n\nTexto'
  const edit = templateInsertEdit(text, text.length, text.length, 'daily', 'pt-BR', now)
  assert.ok(edit.insert.startsWith('\n\n## Prioridades'))
  assert.ok(!edit.insert.includes('# Diário'))
  assert.equal(edit.selectionFrom, text.length + edit.insert.indexOf('- [ ] ') + 6)
  assert.equal(templateInsertEdit(text, 0, 0, 'nope'), null)
  const board = templateInsertEdit(text, 6, 6, 'board', 'pt-BR', now)
  assert.ok(!board.insert.includes('Quadro criado em'))
  assert.ok(board.insert.startsWith('\n\n## Planejamento'))
})

test('renderTemplate fills the profile name and leaves it empty without one', () => {
  setTemplateProfile('Ana')
  assert.equal(renderTemplate('Dono: {{profile}}', { now }).text, 'Dono: Ana')
  setTemplateProfile(undefined)
  assert.equal(renderTemplate('Dono: {{profile}}', { now }).text, 'Dono: ')
})

test('notes marked as templates come first, skip external notes and keep their text', async () => {
  const { setOwnTemplates } = await import('./templates.js')
  setOwnTemplates(
    [
      { id: 'a', name: 'Minha receita.md', body: '# Minha receita\n\n## Passos\n' },
      { id: 'b', name: 'Outra.md', body: '# Outra\n' },
      { id: 'c', name: 'Externa.md', body: '# Externa\n', external: true },
    ],
    { a: true, c: true, gone: true },
    'Seu modelo',
  )
  const list = templateList('pt-BR')
  assert.equal(list[0].id, 'note:a')
  assert.equal(list[0].label, 'Minha receita')
  assert.equal(list[0].description, 'Seu modelo')
  assert.equal(list.filter((item) => item.own).length, 1)
  const edit = templateInsertEdit('# Nota\n\n', 8, 8, 'note:a', 'pt-BR')
  assert.equal(edit.insert, '## Passos\n')
  setOwnTemplates([], {})
  assert.equal(
    templateList('pt-BR').some((item) => item.own),
    false,
  )
})

test('only the board template asks for Board mode', () => {
  const modes = templateList('pt-BR').filter((item) => item.mode)
  assert.deepEqual(
    modes.map((item) => [item.id, item.mode]),
    [['board', 'board']],
  )
})
