import assert from 'node:assert/strict'
import test from 'node:test'
import { detectPlatform } from './platform.js'

test('defaults to desktop', () => {
  assert.equal(detectPlatform({}), 'desktop')
  assert.equal(detectPlatform({ search: '?x=1' }), 'desktop')
})

test('the build target wins over the query string', () => {
  assert.equal(detectPlatform({ target: 'mobile' }), 'mobile')
  assert.equal(detectPlatform({ target: 'desktop', search: '?platform=mobile' }), 'desktop')
})

test('the query string previews the mobile shell', () => {
  assert.equal(detectPlatform({ search: '?platform=mobile' }), 'mobile')
})
