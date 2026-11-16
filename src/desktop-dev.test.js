import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import { desktopConfig, startFrontend } from '../scripts/desktop-dev.mjs'

test('desktop development skips an occupied port and points Tauri at the running frontend', async () => {
  const occupied = createServer()
  await new Promise((resolve) => occupied.listen(0, '127.0.0.1', resolve))
  let frontend
  try {
    const port = occupied.address().port
    frontend = await startFrontend(port)
    assert.notEqual(new URL(frontend.url).port, String(port))
    const response = await fetch(frontend.url)
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Sloth Note/)
    const config = desktopConfig(
      frontend.url,
      "default-src 'self'; connect-src ipc: http://ipc.localhost ws://localhost:5173 http://localhost:5173",
    )
    assert.equal(config.build.devUrl, frontend.url)
    assert.equal(config.build.beforeDevCommand, '')
    assert.ok(config.app.security.devCsp.includes(frontend.url))
    assert.ok(config.app.security.devCsp.includes(frontend.url.replace('http:', 'ws:')))
    assert.ok(!config.app.security.devCsp.includes('localhost:5173'))
  } finally {
    await frontend?.server.close()
    await new Promise((resolve) => occupied.close(resolve))
  }
})

test('desktop file drops use the native webview event bridge', async () => {
  const { readFile } = await import('node:fs/promises')
  const config = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  )
  assert.equal(config.app.windows.find((window) => window.label === 'main').dragDropEnabled, true)
})

test('a profile switch in development starts tauri dev again and keeps the frontend', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { runDesktop } = await import('../scripts/desktop-dev.mjs')
  const folder = await mkdtemp(join(tmpdir(), 'sloth-dev-test-'))
  const restartFile = join(folder, 'restart')
  let runs = 0
  try {
    // First run asks for a restart; the second closes normally.
    const code = await runDesktop({
      restartFile,
      launch: async () => {
        runs++
        if (runs === 1) await writeFile(restartFile, 'profile')
        return 0
      },
    })
    assert.equal(runs, 2)
    assert.equal(code, 0)
    // A crash without the file ends the loop with its code.
    runs = 0
    assert.equal(await runDesktop({ restartFile, launch: async () => (runs++, 101) }), 101)
    assert.equal(runs, 1)
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
