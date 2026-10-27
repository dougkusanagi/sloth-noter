import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openExternalLink } from './external-links.js'

test('external links use the native opener in the installed app', async () => {
  const opened = []
  const target = { __TAURI_INTERNALS__: { invoke() {} } }
  await openExternalLink('https://example.com', target, async (url) => opened.push(url))
  assert.deepEqual(opened, ['https://example.com'])
})

test('browser links keep opening a separate tab; internal and unsafe URLs stay local', async () => {
  const opened = []
  const target = { open: (...args) => opened.push(args) }
  await openExternalLink('https://example.com', target)
  for (const href of ['#section', '#sloth-note/Note', 'javascript:alert(1)', 'file:///secret']) {
    assert.equal(await openExternalLink(href, target), false)
  }
  assert.deepEqual(opened, [['https://example.com', '_blank', 'noopener,noreferrer']])
})
