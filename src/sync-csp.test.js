import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The web build has no CSP, so the E2E tests cannot catch this: the native apps must be
// allowed to reach the sync server the person configured (any https address).
test('the native CSP lets the app reach an https sync server', () => {
  const conf = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)))
  const connect = conf.app.security.csp
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('connect-src'))
    .split(/\s+/)
  assert.ok(connect.includes('https:'))
  assert.ok(connect.includes('http://localhost:*'))
  assert.ok(!connect.includes('http:'), 'plain http to remote hosts stays blocked')
})
