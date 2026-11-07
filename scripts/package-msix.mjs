import { spawn } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const kits = 'C:/Program Files (x86)/Windows Kits/10/bin'
const assets = ['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png']

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code))
  })
}

// Picks makeappx.exe from the newest installed Windows SDK.
export async function findMakeAppx(base = kits) {
  const versions = (await readdir(base).catch(() => []))
    .filter((name) => /^10\.\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
  for (const version of versions) {
    const tool = join(base, version, 'x64', 'makeappx.exe')
    if (await stat(tool).catch(() => null)) return tool
  }
  throw new Error(
    'makeappx.exe não foi encontrado. Instale o Windows SDK (componente "Windows SDK" do Visual Studio Installer).',
  )
}

const xml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

// The Store requires four numeric parts and reserves the last one, which must be 0.
export function storeVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`Versão inválida para a Store: ${version}. Use X.Y.Z.`)
  return `${match[1]}.${match[2]}.${match[3]}.0`
}

export async function packageMsix({
  args = process.argv.slice(2),
  projectRoot = root,
  execute = run,
  makeAppx = findMakeAppx,
  log = console.log,
} = {}) {
  for (const arg of args)
    if (!['--dry-run', '--skip-build'].includes(arg))
      throw new Error(`Argumento desconhecido: ${arg}`)
  const tauri = join(projectRoot, 'src-tauri')
  const store = join(tauri, 'windows/store')
  const identity = JSON.parse(await readFile(join(store, 'identity.json'), 'utf8'))
  const missing = ['name', 'publisher', 'publisherDisplayName'].filter(
    (key) => !String(identity[key] ?? '').trim(),
  )
  if (missing.length)
    throw new Error(
      `Preencha ${missing.join(', ')} em src-tauri/windows/store/identity.json com os valores de Partner Center → seu app → Identidade do produto.`,
    )
  const config = JSON.parse(await readFile(join(tauri, 'tauri.conf.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const version = storeVersion(pkg.version)
  const executable = 'sloth-note.exe'
  const output = join(tauri, 'target/release/bundle/msix')
  const file = join(output, `${config.productName}_${version}_x64.msix`)
  log(`Pacote MSIX: ${file}`)
  if (args.includes('--dry-run')) {
    log('Simulação: nenhum build ou pacote foi gerado.')
    return file
  }
  if (!args.includes('--skip-build')) {
    const code = await execute(process.execPath, [
      join(projectRoot, 'scripts/tauri-cli.mjs'),
      'build',
      '--no-bundle',
      '--features',
      'store',
    ])
    if (code !== 0) throw new Error('Build falhou; nenhum pacote foi gerado.')
  }
  const binary = join(tauri, 'target/release', executable)
  if (!(await stat(binary).catch(() => null)))
    throw new Error(`Executável não encontrado: ${binary}. Execute sem --skip-build.`)

  const stage = join(output, 'stage')
  await rm(stage, { recursive: true, force: true })
  await mkdir(join(stage, 'Assets'), { recursive: true })
  await copyFile(binary, join(stage, executable))
  for (const asset of assets)
    await copyFile(join(tauri, 'icons', asset), join(stage, 'Assets', asset))
  const values = {
    ...identity,
    version,
    arch: 'x64',
    executable,
    displayName: config.productName,
    description: config.bundle?.shortDescription ?? config.productName,
  }
  const template = await readFile(join(store, 'AppxManifest.xml'), 'utf8')
  const manifest = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Valor ausente no manifesto: ${key}`)
    return xml(values[key])
  })
  await writeFile(join(stage, 'AppxManifest.xml'), manifest)

  await rm(file, { force: true })
  const code = await execute(await makeAppx(), ['pack', '/o', '/d', stage, '/p', file])
  if (code !== 0) throw new Error(`makeappx falhou (código ${code ?? 'interrompido'}).`)
  log('Pacote pronto. Envie este arquivo em Partner Center → Envio → Pacotes.')
  return file
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  packageMsix().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
