import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installedAppImage, replaceAppImage } from '../scripts/update-appimage.mjs'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'sloth-update-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const apps = join(root, 'applications')
  const folder = join(root, 'pasta escolhida pelo usuário')
  await mkdir(apps)
  await mkdir(folder)
  const target = join(folder, 'sloth note.appimage')
  await writeFile(target, 'old version', { mode: 0o755 })
  await writeFile(
    join(apps, 'sloth.desktop'),
    `[Desktop Entry]\nType=Application\nName=Sloth Note\nTryExec=${target}\nExec=env DESKTOPINTEGRATION=1 "${target}"\n[Desktop Action Other]\nTryExec=/wrong/path\n`,
  )
  return { root, apps, target }
}

test('finds the registered AppImage in a custom folder containing spaces', async (t) => {
  const { apps, target } = await fixture(t)
  assert.equal(await installedAppImage(apps, 'Sloth Note'), target)
})

test('replaces the binary atomically, retaining the previous version and executable mode', async (t) => {
  const { root, target } = await fixture(t)
  const source = join(root, 'new.AppImage')
  const content = Buffer.concat([
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0, 0x41, 0x49, 0x02]),
    Buffer.from('new version'),
  ])
  await writeFile(source, content)
  await replaceAppImage(source, target)
  assert.deepEqual(await readFile(target), content)
  assert.equal(await readFile(`${target}.previous`, 'utf8'), 'old version')
  assert.equal((await stat(target)).mode & 0o777, 0o755)
  await assert.rejects(stat(`${target}.update-lock`), { code: 'ENOENT' })
})

test('invalid artifacts and concurrent updates leave the installed binary intact', async (t) => {
  const { root, target } = await fixture(t)
  const source = join(root, 'new.AppImage')
  await writeFile(source, 'not an appimage')
  await assert.rejects(replaceAppImage(source, target), /AppImage tipo 2/)
  assert.equal(await readFile(target, 'utf8'), 'old version')
  await writeFile(source, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 0, 0, 0, 0x41, 0x49, 0x02]))
  await writeFile(`${target}.update-lock`, 'another update')
  await assert.rejects(replaceAppImage(source, target), { code: 'EEXIST' })
  assert.equal(await readFile(target, 'utf8'), 'old version')
})

test('refuses ambiguous installations rather than replacing an arbitrary one', async (t) => {
  const { root, apps } = await fixture(t)
  const second = join(root, 'second.appimage')
  await writeFile(second, 'second')
  await writeFile(
    join(apps, 'second.desktop'),
    `[Desktop Entry]\nType=Application\nName=Sloth Note\nTryExec=${second}\n`,
  )
  await assert.rejects(installedAppImage(apps, 'Sloth Note'), /Encontradas 2 instalações/)
})
