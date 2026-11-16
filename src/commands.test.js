import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCommands } from './commands.js'
import { messageKeys } from './i18n.js'

const entries = (options) => buildCommands(options).flatMap(([, commands]) => commands)
const base = { active: null, activePinned: false, trashCount: 0, desktop: false }

test('the help page can be recreated from the palette even with no open note', () => {
  const welcome = entries({ ...base, prefs: { language: 'pt-BR', theme: 'system' } }).find(
    ([id]) => id === 'welcome',
  )
  assert.ok(welcome)
  assert.equal(welcome[1], 'menu.welcome')
  assert.ok(!welcome[4], 'never disabled')
  for (const language of ['pt-BR', 'en']) assert.ok(messageKeys(language).includes('menu.welcome'))
})

test('the main menu keeps only frequent actions without another visible place', () => {
  const menu = (active) =>
    entries({ ...base, active, prefs: { language: 'pt-BR', theme: 'system' } })
      .filter((entry) => entry[5])
      .map(([id]) => id)
  const ids = menu({ id: 'n1' })
  assert.ok(ids.length <= 14, `menu has ${ids.length} items`)
  for (const id of ['newNote', 'findNote', 'searchAllNotes', 'trash', 'settings', 'commands'])
    assert.ok(ids.includes(id), id)
  assert.ok(!ids.includes('copyToNotes'), 'shown only for a file opened in place')
  assert.ok(menu({ id: 'n1', external: true }).includes('copyToNotes'))
})

test('command ids are unique', () => {
  const ids = entries({ ...base, prefs: { language: 'en', theme: 'dark' } }).map(([id]) => id)
  assert.equal(new Set(ids).size, ids.length)
})

test('global navigation and view commands are available with their shortcuts', () => {
  const commands = entries({ ...base, active: { id: 'note' }, mode: 'visual', prefs: {} })
  for (const [id, keys] of [
    ['outline', 'Alt+T'],
    ['reopenTab', 'Shift+T'],
    ['previousTab', 'PageUp'],
    ['nextTab', 'PageDown'],
    ['resetText', '0'],
    ['resetWidth', 'Alt+0'],
    ['narrower', 'Alt+-'],
    ['wider', 'Alt++'],
  ]) {
    const command = commands.find(([key]) => key === id)
    assert.ok(command, id)
    assert.equal(command[3], keys)
    assert.ok(!command[4])
  }
  for (const options of [{ active: null }, { active: { id: 'note' }, mode: 'source' }]) {
    assert.equal(
      entries({ ...base, prefs: {}, ...options }).find(([id]) => id === 'outline')[4],
      true,
    )
  }
})
