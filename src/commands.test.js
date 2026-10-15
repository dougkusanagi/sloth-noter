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
