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
