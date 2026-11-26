import test from 'node:test'
import assert from 'node:assert/strict'
import { buildGitHubBackupRequest, validateProviderConfig } from './sync/providers.js'

test('C2: validates self-hosted, github, and folder sync providers safely', () => {
  assert.equal(validateProviderConfig('self-hosted', { url: 'https://sync.example.com' }).ok, true)
  assert.equal(validateProviderConfig('self-hosted', { url: 'http://sync.example.com' }).ok, false)
  assert.equal(validateProviderConfig('self-hosted', { url: 'http://127.0.0.1:8787' }).ok, true)

  assert.equal(
    validateProviderConfig('github', { repository: 'user/notes', path: 'backups/data.json' }).ok,
    true,
  )
  assert.equal(
    validateProviderConfig('github', { repository: 'user/notes', path: '../secret.json' }).ok,
    false,
  )
  assert.equal(validateProviderConfig('folder', { folderPath: '/home/user/Sync' }).ok, true)
  assert.equal(validateProviderConfig('folder', { folderPath: '../outside' }).ok, false)

  const req = buildGitHubBackupRequest({
    repository: 'user/notes',
    branch: 'main',
    path: 'backups/sloth.json',
    contentBase64: 'e30=',
    sha: 'abc123',
  })
  assert.equal(req.method, 'PUT')
  assert.equal(req.url, 'https://api.github.com/repos/user/notes/contents/backups/sloth.json')
  assert.equal(req.body.sha, 'abc123')
})
