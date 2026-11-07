import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { packageMsix, storeVersion } from '../scripts/package-msix.mjs'

const template = await readFile(
  new URL('../src-tauri/windows/store/AppxManifest.xml', import.meta.url),
  'utf8',
)

async function fixture(t, identity) {
  const projectRoot = await mkdtemp(join(tmpdir(), 'sloth msix '))
  t.after(() => rm(projectRoot, { recursive: true, force: true }))
  const tauri = join(projectRoot, 'src-tauri')
  await mkdir(join(tauri, 'windows/store'), { recursive: true })
  await mkdir(join(tauri, 'icons'))
  await mkdir(join(tauri, 'target/release'), { recursive: true })
  await writeFile(join(tauri, 'windows/store/AppxManifest.xml'), template)
  await writeFile(join(tauri, 'windows/store/identity.json'), JSON.stringify(identity))
  await writeFile(
    join(tauri, 'tauri.conf.json'),
    JSON.stringify({ productName: 'Sloth Note', bundle: { shortDescription: 'Notas & Markdown' } }),
  )
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify({ version: '1.2.3' }))
  await writeFile(join(tauri, 'target/release/sloth-note.exe'), 'fixture')
  for (const name of ['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png'])
    await writeFile(join(tauri, 'icons', name), 'png')
  return { projectRoot, tauri }
}

const identity = {
  name: '12345Dev.SlothNote',
  publisher: 'CN=ABCDEF',
  publisherDisplayName: 'Dev',
}

test('Store version adds the reserved revision 0', () => {
  assert.equal(storeVersion('0.3.0'), '0.3.0.0')
  assert.throws(() => storeVersion('1.0.0-beta'), /Versão inválida/)
})

test('refuses to package without the Partner Center identity', async (t) => {
  const { projectRoot } = await fixture(t, {
    name: '',
    publisher: ' ',
    publisherDisplayName: 'Dev',
  })
  await assert.rejects(
    packageMsix({ projectRoot, args: ['--skip-build'], log: () => {} }),
    /Preencha name, publisher/,
  )
})

test('builds the store feature, writes the manifest and packs it', async (t) => {
  const { projectRoot, tauri } = await fixture(t, identity)
  const calls = []
  const file = await packageMsix({
    projectRoot,
    args: [],
    log: () => {},
    makeAppx: async () => 'makeappx.exe',
    execute: async (command, args) => {
      calls.push([command, ...args])
      return 0
    },
  })
  assert.ok(calls[0].includes('--features') && calls[0].includes('store'))
  assert.deepEqual(calls[1].slice(0, 4), ['makeappx.exe', 'pack', '/o', '/d'])
  assert.match(file, /Sloth Note_1\.2\.3\.0_x64\.msix$/)
  const manifest = await readFile(
    join(tauri, 'target/release/bundle/msix/stage/AppxManifest.xml'),
    'utf8',
  )
  assert.match(manifest, /Name="12345Dev\.SlothNote" Publisher="CN=ABCDEF" Version="1\.2\.3\.0"/)
  assert.match(manifest, /Notas &amp; Markdown/)
  assert.doesNotMatch(manifest, /\{\{/)
})

test('stops when the build fails', async (t) => {
  const { projectRoot } = await fixture(t, identity)
  await assert.rejects(
    packageMsix({ projectRoot, args: [], log: () => {}, execute: async () => 1 }),
    /Build falhou/,
  )
})
