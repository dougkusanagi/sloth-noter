import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import {
  chmod,
  copyFile,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export function desktopEntry(text) {
  const values = {}
  let active = false
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('[')) active = line.trim() === '[Desktop Entry]'
    if (!active || line.startsWith('#')) continue
    const at = line.indexOf('=')
    if (at > 0) values[line.slice(0, at)] = line.slice(at + 1)
  }
  return values
}

function desktopString(value) {
  return value.replace(
    /\\([sntr\\])/g,
    (_, character) => ({ s: ' ', n: '\n', t: '\t', r: '\r', '\\': '\\' })[character],
  )
}

export async function installedAppImage(directory, productName) {
  const candidates = new Set()
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.desktop')) continue
    const entry = desktopEntry(await readFile(join(directory, name), 'utf8'))
    if (entry.Type !== 'Application' || entry.Hidden === 'true') continue
    if ((entry['X-AppImage-Name'] || entry.Name) !== productName) continue
    const target = desktopString(entry.TryExec ?? '')
    if (!isAbsolute(target) || !/\.appimage$/i.test(target)) continue
    // Gear Lever stores the actual installed path in TryExec, even when Exec
    // includes environment variables, arguments, or quoted paths with spaces.
    candidates.add(await realpath(target))
  }
  if (candidates.size !== 1)
    throw new Error(
      `Encontradas ${candidates.size} instalações de ${productName} em ${directory}; esperado exatamente uma com TryExec apontando para o AppImage.`,
    )
  return [...candidates][0]
}

// Updating an AppImage does not refresh launchers previously created by Gear Lever.
export function associatedDesktopEntry(text, mimeTypes) {
  const entry = desktopEntry(text)
  if (!entry.Exec) throw new Error('O atalho instalado não contém Exec.')
  const types = new Set([...(entry.MimeType || '').split(';').filter(Boolean), ...mimeTypes])
  const exec = /%(?:f|F|u|U)\b/.test(entry.Exec) ? entry.Exec : `${entry.Exec} %F`
  const values = { Exec: exec, MimeType: `${[...types].join(';')};` }
  values.Categories = (entry.Categories || '').split(';').some(Boolean)
    ? entry.Categories
    : 'Utility;TextEditor;'
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === '[Desktop Entry]')
  let end = lines.findIndex((line, index) => index > start && line.startsWith('['))
  if (end < 0) end = lines.length
  const section = lines.slice(start + 1, end).filter((line) => {
    const key = line.slice(0, line.indexOf('='))
    return !Object.hasOwn(values, key)
  })
  section.push(...Object.entries(values).map(([key, value]) => `${key}=${value}`))
  lines.splice(start + 1, end - start - 1, ...section)
  return lines.join('\n')
}

export async function refreshDesktopEntries(directory, target, mimeTypes) {
  const installed = await realpath(target)
  for (const name of await readdir(directory)) {
    if (!name.endsWith('.desktop')) continue
    const path = join(directory, name)
    const text = await readFile(path, 'utf8')
    const entry = desktopEntry(text)
    if (entry.Type !== 'Application' || entry.Hidden === 'true') continue
    const executable = desktopString(entry.TryExec || '')
    if (!isAbsolute(executable)) continue
    const resolved = await realpath(executable).catch(() => null)
    if (resolved !== installed) continue
    const updated = associatedDesktopEntry(text, mimeTypes)
    if (updated === text) continue
    await copyFile(path, `${path}.previous`)
    await writeFile(path, updated)
  }
  const child = spawn('update-desktop-database', [directory], { stdio: 'inherit' })
  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('Não foi possível atualizar a lista de aplicativos.')),
    )
  })
}

export async function replaceAppImage(source, target) {
  if ((await realpath(source)) === (await realpath(target)))
    throw new Error('Origem e destino são o mesmo arquivo.')
  const sourceInfo = await stat(source)
  const targetInfo = await stat(target)
  if (!sourceInfo.isFile() || !targetInfo.isFile())
    throw new Error('Origem e destino devem ser arquivos regulares.')
  const sourceFile = await open(source, 'r')
  try {
    const header = Buffer.alloc(11)
    await sourceFile.read(header, 0, 11, 0)
    if (
      !header.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) ||
      !header.subarray(8, 11).equals(Buffer.from([0x41, 0x49, 0x02]))
    )
      throw new Error('O arquivo gerado não é um AppImage tipo 2 válido.')
  } finally {
    await sourceFile.close()
  }
  const lockPath = `${target}.update-lock`
  const lock = await open(lockPath, 'wx')
  const temporary = `${target}.update-${process.pid}.tmp`
  try {
    await copyFile(source, temporary, constants.COPYFILE_EXCL)
    await chmod(temporary, (targetInfo.mode & 0o777) | 0o100)
    const file = await open(temporary, 'r')
    try {
      await file.sync()
    } finally {
      await file.close()
    }
    await copyFile(target, `${target}.previous`)
    await rename(temporary, target)
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
    await lock.close()
    await unlink(lockPath)
  }
}

export async function main() {
  if (process.platform !== 'linux') throw new Error('Este comando atualiza AppImages no Linux.')
  const args = process.argv.slice(2)
  for (const arg of args)
    if (!['--dry-run', '--skip-build'].includes(arg))
      throw new Error(`Argumento desconhecido: ${arg}`)
  const config = JSON.parse(await readFile(join(root, 'src-tauri/tauri.conf.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share')
  const target = await installedAppImage(join(dataHome, 'applications'), config.productName)
  console.log(`AppImage instalado: ${target}`)
  if (!args.includes('--skip-build') && !args.includes('--dry-run')) {
    const child = spawn(
      'bun',
      [
        'run',
        'desktop:build',
        '--config',
        'src-tauri/tauri.linux.conf.json',
        '--bundles',
        'appimage',
      ],
      { cwd: root, stdio: 'inherit' },
    )
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code) => resolve(code))
    })
    if (code !== 0) throw new Error('Build falhou; o AppImage instalado foi preservado.')
  }
  const bundle = join(root, 'src-tauri/target/release/bundle/appimage')
  const architecture = { x64: 'amd64', arm64: 'aarch64' }[process.arch]
  if (!architecture) throw new Error(`Arquitetura não suportada: ${process.arch}`)
  const source = join(bundle, `${config.productName}_${pkg.version}_${architecture}.AppImage`)
  console.log(`AppImage gerado: ${source}`)
  if (args.includes('--dry-run')) {
    console.log('Simulação: nenhum build ou arquivo foi alterado.')
    return
  }
  await replaceAppImage(source, target)
  await refreshDesktopEntries(
    join(dataHome, 'applications'),
    target,
    config.bundle.fileAssociations.map((association) => association.mimeType).filter(Boolean),
  )
  console.log(`Atualizado. Versão anterior: ${target}.previous`)
  console.log('Feche e abra novamente o Sloth Note para usar a nova versão.')
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
