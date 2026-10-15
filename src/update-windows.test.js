import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { updateWindows } from '../scripts/update-windows.mjs'

async function fixture(t, { legacyMsi = false, installerCode = 0, buildCode = 0 } = {}) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'sloth windows update '))
  t.after(() => rm(projectRoot, { recursive: true, force: true }))
  await mkdir(join(projectRoot, 'src-tauri'))
  await writeFile(
    join(projectRoot, 'src-tauri/tauri.conf.json'),
    JSON.stringify({ productName: 'Sloth Note' }),
  )
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ version: '0.1.0' }))
  const bundle = join(projectRoot, 'src-tauri/target/release/bundle/nsis')
  await mkdir(bundle, { recursive: true })
  const source = join(bundle, 'Sloth Note_0.1.0_x64-setup.exe')
  await writeFile(source, 'fixture NSIS; native execution is mocked')
  const calls = []
  const logs = []
  const options = {
    projectRoot,
    architecture: 'x64',
    args: [],
    log: (message) => logs.push(message),
    checkLegacy: async (name) => {
      calls.push(['query', name])
      if (legacyMsi) throw new Error('Existe uma instalação MSI. Desinstale-a uma vez.')
    },
    execute: async (command, args) => {
      calls.push([command, args])
      return command === source ? installerCode : buildCode
    },
  }
  return { options, calls, logs, bundle, source }
}

test('Windows builds NSIS and installs silently, preserving a path containing spaces', async (t) => {
  const { options, calls, source } = await fixture(t)
  await updateWindows(options)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls[0], ['query', 'Sloth Note'])
  assert.equal(calls[1][0], process.execPath)
  assert.deepEqual(calls[1][1].slice(1), [
    'build',
    '--config',
    'src-tauri/tauri.windows.conf.json',
    '--bundles',
    'nsis',
  ])
  assert.deepEqual(calls[2], [source, ['/S']])
})

test('Windows skip-build runs only the legacy check and silent installer', async (t) => {
  const { options, calls, source } = await fixture(t)
  await updateWindows({ ...options, args: ['--skip-build'] })
  assert.deepEqual(calls, [
    ['query', 'Sloth Note'],
    [source, ['/S']],
  ])
})

test('Windows refuses legacy MSI migration before building or installing', async (t) => {
  const { options, calls } = await fixture(t, { legacyMsi: true })
  await assert.rejects(updateWindows(options), /Desinstale-a uma vez/)
  assert.deepEqual(calls, [['query', 'Sloth Note']])
})

test('Windows dry-run needs no existing artifact and runs no build, query or installer', async (t) => {
  const { options, calls, bundle, logs } = await fixture(t)
  await rm(bundle, { recursive: true })
  await updateWindows({ ...options, args: ['--dry-run'] })
  assert.deepEqual(calls, [])
  assert.match(logs.join('\n'), /Simulação/)
})

test('Windows build failure never launches the installer', async (t) => {
  const { options, calls } = await fixture(t, { buildCode: 1 })
  await assert.rejects(updateWindows(options), /Build falhou/)
  assert.equal(calls.length, 2)
})

test('Windows ignores stale versions, other architectures and old MSI artifacts', async (t) => {
  const { options, calls, bundle, source } = await fixture(t)
  await writeFile(join(bundle, 'Sloth Note_0.0.9_x64-setup.exe'), '')
  await writeFile(join(bundle, 'Sloth Note_0.1.0_arm64-setup.exe'), '')
  await writeFile(join(bundle, 'Sloth Note_0.1.0_x64_en-US.msi'), '')
  await rm(source)
  await assert.rejects(updateWindows({ ...options, args: ['--skip-build'] }), /não encontrado/)
  assert.deepEqual(calls, [['query', 'Sloth Note']])
})

test('Windows reports a running editor and installer failures, accepting reboot-required success', async (t) => {
  for (const installerCode of [10, 1, 2, null, 3010]) {
    const { options, logs } = await fixture(t, { installerCode })
    const updating = updateWindows({ ...options, args: ['--skip-build'] })
    if (installerCode === 10) await assert.rejects(updating, /Feche o Sloth Note/)
    else if (installerCode !== 3010) await assert.rejects(updating, /falhou/)
    else {
      await updating
      assert.match(logs.at(-1), /Reinicie o Windows/)
    }
  }
})

test('Windows rejects unsupported arguments and architectures before running commands', async (t) => {
  const { options, calls } = await fixture(t)
  await assert.rejects(updateWindows({ ...options, args: ['--silent'] }), /Argumento desconhecido/)
  await assert.rejects(updateWindows({ ...options, architecture: 'riscv64' }), /Arquitetura/)
  assert.deepEqual(calls, [])
})
