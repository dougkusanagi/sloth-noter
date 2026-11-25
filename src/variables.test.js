import test from 'node:test'
import assert from 'node:assert/strict'
import { setLanguage } from './i18n.js'
import { lineVariables, resolveVariable } from './variables.js'

const now = new Date(2026, 10, 16, 14, 30)
const body =
  '---\nresponsavel: Ana\nativo: true\nnota: 7.5\nprazo: 2026-12-01\ntags: [a, b]\n---\n# Plano\n\nUma duas três.\n\n- [x] A\n- [ ] B\n- [-] C\n'
const context = { body, modifiedAt: new Date(2026, 10, 16, 9, 5).getTime(), now, language: 'pt-BR' }

test.beforeEach(() => setLanguage('pt-BR'))

test('resolveVariable shows dates, counts and task progress', () => {
  assert.equal(resolveVariable('today', undefined, context).text, '16/11/2026')
  assert.equal(
    resolveVariable('created', undefined, {
      ...context,
      createdAt: new Date(2026, 9, 5, 10, 0).getTime(),
    }).text,
    '05/10/2026',
  )
  assert.equal(resolveVariable('created', undefined, context).text, 'data de criação desconhecida')
  assert.equal(resolveVariable('updated', undefined, context).text, 'hoje, 09:05')
  assert.equal(
    resolveVariable('updated', undefined, {
      ...context,
      modifiedAt: new Date(2026, 10, 13).getTime(),
    }).text,
    'há 3 dias',
  )
  assert.equal(resolveVariable('words', undefined, context).text, '14')
  assert.equal(resolveVariable('reading', undefined, context).text, '1 min de leitura')
  assert.equal(resolveVariable('tasks', undefined, context).text, '1 de 2')
})

test('resolveVariable counts the days until a date', () => {
  assert.equal(resolveVariable('until', '2026-12-01', context).text, 'faltam 15 dias')
  assert.equal(resolveVariable('until', '2026-11-17', context).text, 'falta 1 dia')
  assert.equal(resolveVariable('until', '2026-11-16', context).text, 'vence hoje')
  assert.equal(resolveVariable('until', '2026-11-14', context).text, 'venceu há 2 dias')
  assert.ok(resolveVariable('until', '2026-13-40', context).error)
  assert.ok(resolveVariable('until', undefined, context).error)
})

test('user properties come from the YAML block with their own types', () => {
  const value = (name) => resolveVariable(name, undefined, context)
  assert.equal(value('user.responsavel').text, 'Ana')
  assert.equal(value('user.ativo').text, 'Sim')
  assert.equal(value('user.nota').text, '7,5')
  assert.equal(value('user.prazo').text, '01/12/2026')
  assert.equal(value('user.tags').text, 'a, b')
  assert.ok(value('user.nada').error.includes('nada'))
  assert.ok(value('desconhecida').error.includes('desconhecida'))
})

test('a property named like a variable never overrides it and values are not expanded', () => {
  const tricky = { ...context, body: '---\nupdated: ontem\ntexto: "{{today}}"\n---\n# T\n' }
  assert.notEqual(resolveVariable('updated', undefined, tricky).text, 'ontem')
  assert.equal(resolveVariable('user.texto', undefined, tricky).text, '{{today}}')
})

test('lineVariables finds variables outside inline code', () => {
  const found = lineVariables(
    'Veja {{today}}, `{{updated}}` e {{ until:2026-12-01 }} e {{user.a-b}}.',
  )
  assert.deepEqual(
    found.map((item) => [item.name, item.argument]),
    [
      ['today', undefined],
      ['until', '2026-12-01'],
      ['user.a-b', undefined],
    ],
  )
})

test('propertyReferences counts uses outside code', async () => {
  const { propertyReferences } = await import('./variables.js')
  const text =
    '---\nnome: Ana\n---\n# T\n\n{{user.nome}} e {{user.nome}} e `{{user.nome}}`\n\n```\n{{user.nome}}\n```\n{{user.outro}}\n'
  assert.equal(propertyReferences(text, 'nome'), 2)
  assert.equal(propertyReferences(text, 'outro'), 1)
  assert.equal(propertyReferences(text, 'x'), 0)
})

test('variableChoices lists the document variables and the note properties', async () => {
  const { variableChoices, variableInsertEdit } = await import('./variables.js')
  const choices = variableChoices(body, context)
  assert.deepEqual(
    choices.map((item) => item.id),
    [
      'today',
      'created',
      'updated',
      'words',
      'reading',
      'tasks',
      'until',
      ...choices.slice(7).map((i) => i.id),
    ],
  )
  assert.ok(choices.some((item) => item.id === 'user.responsavel' && item.preview === 'Ana'))
  const until = choices.find((item) => item.id === 'until')
  assert.equal(until.insert, '{{until:2026-11-23}}')
  const edit = variableInsertEdit(10, 12, until)
  assert.equal(edit.insert.slice(edit.selectionFrom - 10, edit.selectionTo - 10), '2026-11-23')
  const today = variableInsertEdit(3, 3, choices[0])
  assert.equal(today.selectionFrom, 3 + '{{today}}'.length)
})

test('remarkVariables turns variables in text into chips and skips code', async () => {
  const { remarkVariables } = await import('./variables.js')
  const tree = {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', value: 'Data: {{today}} e {{user.responsavel}} e {{desconhecida}}.' },
          { type: 'inlineCode', value: '{{today}}' },
        ],
      },
    ],
  }
  remarkVariables(context)(tree)
  const nodes = tree.children[0].children
  const chips = nodes.filter((node) => node.data?.hName === 'span')
  assert.equal(chips.length, 3)
  assert.equal(chips[0].children[0].value, '16/11/2026')
  assert.deepEqual(chips[0].data.hProperties.className, ['md-variable'])
  assert.equal(chips[1].children[0].value, 'Ana')
  assert.equal(chips[2].children[0].value, '{{desconhecida}}')
  assert.deepEqual(chips[2].data.hProperties.className, ['md-variable', 'md-variable-error'])
  assert.equal(nodes[nodes.length - 1].type, 'inlineCode')
})
