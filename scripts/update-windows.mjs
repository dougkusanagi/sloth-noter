import { spawn, execFile } from 'node:child_process'
import { readFile, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code) => resolve(code))
  })
}

async function checkLegacyMsi(productName) {
  // Read both registry views without invoking Win32_Product (which can trigger repairs).
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$paths = @(
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKCU:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$found = Get-ItemProperty $paths -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -eq $env:SLOTH_UPDATE_PRODUCT -and $_.WindowsInstaller -eq 1 }
if ($found) { [Console]::Write('msi') } else { [Console]::Write('ready') }
`
  const { stdout } = await promisify(execFile)(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { env: { ...process.env, SLOTH_UPDATE_PRODUCT: productName }, windowsHide: true },
  )
  if (stdout.trim() === 'msi')
    throw new Error(
      'Existe uma instalação MSI do Sloth Note. Desinstale-a uma vez pelas Configurações do Windows e execute o comando novamente para migrar para a instalação por usuário. A remoção do MSI pode exigir administrador.',
    )
  if (stdout.trim() !== 'ready')
    throw new Error('Não foi possível consultar a instalação anterior.')
}

export async function updateWindows({
  args = process.argv.slice(2),
  projectRoot = root,
  architecture = process.arch,
  execute = run,
  checkLegacy = checkLegacyMsi,
  log = console.log,
} = {}) {
  for (const arg of args)
    if (!['--dry-run', '--skip-build'].includes(arg))
      throw new Error(`Argumento desconhecido: ${arg}`)
  const arch = { x64: 'x64', arm64: 'arm64', ia32: 'x86' }[architecture]
  if (!arch) throw new Error(`Arquitetura não suportada: ${architecture}`)
  const config = JSON.parse(await readFile(join(projectRoot, 'src-tauri/tauri.conf.json'), 'utf8'))
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
  const bundle = join(projectRoot, 'src-tauri/target/release/bundle/nsis')
  const filename = `${config.productName}_${pkg.version}_${arch}-setup.exe`
  log(`Instalador NSIS: ${join(bundle, filename)}`)
  if (args.includes('--dry-run')) {
    log('Simulação: nenhum build ou instalador foi executado.')
    return
  }
  await checkLegacy(config.productName)
  if (!args.includes('--skip-build')) {
    const code = await execute(process.execPath, [
      require.resolve('@tauri-apps/cli/tauri.js'),
      'build',
      '--config',
      'src-tauri/tauri.windows.conf.json',
      '--bundles',
      'nsis',
    ])
    if (code !== 0) throw new Error('Build falhou; o aplicativo instalado foi preservado.')
  }
  const candidates = (await readdir(bundle)).filter((name) => name === filename)
  if (candidates.length !== 1)
    throw new Error(
      `Instalador NSIS não encontrado: ${join(bundle, filename)}. Execute o build para gerar a versão e arquitetura atuais.`,
    )
  const source = join(bundle, candidates[0])
  if (!(await stat(source)).isFile()) throw new Error(`O instalador não é um arquivo: ${source}`)
  log('Instalando silenciosamente para o usuário atual...')
  const code = await execute(source, ['/S'])
  if (code === 10)
    throw new Error('Feche o Sloth Note e execute o comando novamente para atualizar.')
  if (![0, 3010].includes(code))
    throw new Error(`Instalador NSIS falhou (código ${code ?? 'interrompido'}).`)
  log(
    code === 0
      ? 'Atualizado. Abra novamente o Sloth Note para usar a nova versão.'
      : 'Atualizado. Reinicie o Windows para concluir a instalação.',
  )
}

export const main = updateWindows
