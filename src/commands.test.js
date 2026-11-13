import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCommands } from './commands.js'
import { messageKeys } from './i18n.js'

const entries = (options) => buildCommands(options).flatMap(([, commands]) => commands)
const base = { active: null, activePinned: false, trashCount: 0, desktop: false }

test('the help page can be recreated from the menu and palette even with no open note', () => {
  const welcome = entries({ ...base, prefs: { language: 'pt-BR', theme: 'system' } }).find(
    ([id]) => id === 'welcome',
  )
  assert.ok(welcome)
  assert.equal(welcome[1], 'menu.welcome')
  assert.equal(welcome[4], false, 'never disabled')
  assert.equal(welcome[5], true, 'listed in the menu')
  for (const language of ['pt-BR', 'en']) assert.ok(messageKeys(language).includes('menu.welcome'))
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
