import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_FOLDER, credentials, restore, save } from '../scripts/credentials.mjs'

async function sandbox() {
  const root = await mkdtemp(join(tmpdir(), 'sloth-cred-'))
  const home = join(root, 'home')
  const repo = join(root, 'repo')
  for (const item of credentials(home, repo).slice(0, 3)) {
    await mkdir(join(item.path, '..'), { recursive: true })
    await writeFile(item.path, `segredo ${item.file}`)
  }
  return { root, home, repo, log: () => {} }
}

test('save copies the existing credentials with private permissions and a manifest', async () => {
  const { root, home, repo, log } = await sandbox()
  try {
    const folder = join(root, 'cofre')
    const saved = await save(folder, { home, repo, log })
    assert.deepEqual(
      saved.map((item) => item.file),
      ['updater.key', 'updater.key.pub', 'android-debug.keystore'],
    )
    if (process.platform !== 'win32') {
      assert.equal((await stat(folder)).mode & 0o777, 0o700)
      assert.equal((await stat(join(folder, 'updater.key'))).mode & 0o777, 0o600)
    }
    const manifest = JSON.parse(await readFile(join(folder, 'credenciais.json'), 'utf8'))
    assert.equal(manifest.files[0].path, '.local/share/sloth-note/signing/updater.key')
    await assert.rejects(save(join(repo, 'cofre'), { home, repo, log }), /dentro do repositório/)
    const inRepo = await save(join(repo, DEFAULT_FOLDER), { home, repo, log })
    assert.equal(inRepo.length, 3, 'the default name, ignored by git, is allowed in the repo')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('restore puts files back and never silently replaces a different key', async () => {
  const { root, home, repo, log } = await sandbox()
  try {
    const folder = join(root, 'cofre')
    await save(folder, { home, repo, log })
    const [key, , keystore] = credentials(home, repo)
    await rm(keystore.path)
    await writeFile(key.path, 'chave nova')
    const result = await restore(folder, { home, repo, log })
    assert.deepEqual(result.restored, ['android-debug.keystore'])
    assert.deepEqual(result.kept, ['updater.key'])
    assert.deepEqual(result.same, ['updater.key.pub'])
    assert.equal(await readFile(keystore.path, 'utf8'), 'segredo android-debug.keystore')
    assert.equal(await readFile(key.path, 'utf8'), 'chave nova')
    if (process.platform !== 'win32') {
      assert.equal((await stat(keystore.path)).mode & 0o777, 0o600)
    }
    const forced = await restore(folder, { home, repo, log, force: true })
    assert.deepEqual(forced.restored, ['updater.key'])
    assert.equal(await readFile(key.path, 'utf8'), 'segredo updater.key')
    await assert.rejects(restore(join(root, 'vazia'), { home, repo, log }), /credenciais\.json/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
