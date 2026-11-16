import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addProfile, initialProfiles, validateProfiles } from './profiles.js'

test('profile catalog limits creation to five and rejects malformed paths', () => {
  let catalog = initialProfiles()
  for (let i = 1; i <= 4; i++)
    catalog = addProfile(catalog, `Perfil ${i}`, `00000000-0000-4000-8000-00000000000${i}`)
  assert.equal(validateProfiles(catalog), true)
  assert.throws(() => addProfile(catalog, 'Sexto'))
  assert.equal(validateProfiles({ active: '../x', profiles: [{ id: '../x', name: 'X' }] }), false)
  assert.equal(validateProfiles({ ...catalog, active: 'missing' }), false)
})

test('profiles can be renamed, and names stay distinct', async () => {
  const { renameProfile } = await import('./profiles.js')
  const id = '6d291a0b-3451-41d0-b592-b1533e911fbe'
  let catalog = addProfile(initialProfiles(), 'Douglas', id)
  catalog = renameProfile(catalog, id, '  Trabalho ')
  assert.deepEqual(catalog.profiles[1], { id, name: 'Trabalho' })
  assert.equal(renameProfile(catalog, 'primary', 'Casa').profiles[0].name, 'Casa')
  assert.equal(renameProfile(catalog, id, 'trabalho').profiles[1].name, 'trabalho')
  assert.throws(() => renameProfile(catalog, id, 'principal'), /duplicate_name/)
  assert.throws(() => addProfile(catalog, 'TRABALHO'), /duplicate_name/)
  assert.throws(() => renameProfile(catalog, id, '   '), /invalid_name/)
  assert.throws(() => renameProfile(catalog, 'nope', 'X'), /invalid_profile/)
})
