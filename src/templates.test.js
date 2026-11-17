import test from 'node:test'
import assert from 'node:assert/strict'
import { renderTemplate, templateInsertEdit, templateList } from './templates.js'

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

test('the task template uses every task status', () => {
  const body = templateList('pt-BR').find((item) => item.id === 'tasks').body
  for (const mark of ['[ ]', '[/]', '[>]', '[x]', '[-]']) assert.ok(body.includes(`- ${mark} `))
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
  assert.ok(edit.insert.startsWith('\n\n## Três prioridades'))
  assert.ok(!edit.insert.includes('# Diário'))
  assert.equal(edit.selectionFrom, text.length + edit.insert.indexOf('- [ ] ') + 6)
  assert.equal(templateInsertEdit(text, 0, 0, 'nope'), null)
  const tasks = templateInsertEdit(text, 6, 6, 'tasks', 'pt-BR', now)
  assert.ok(tasks.insert.includes('Criado em 16/11/2026'))
})
