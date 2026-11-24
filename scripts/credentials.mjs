// Development credentials in one folder: `save` copies them there, `restore` puts each
// one back where the tools expect it. The folder holds secrets in plain files: keep it
// outside the repository, on encrypted storage (password manager, encrypted drive).
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const MANIFEST = 'credenciais.json'
/** Default folder, in the current directory; .gitignore ignores this name everywhere. */
export const DEFAULT_FOLDER = '.credenciais'

/** Every credential: name in the folder, where it lives, and why it matters. */
export function credentials(home = homedir(), repo = REPO) {
  return [
    {
      file: 'updater.key',
      path: join(home, '.local/share/sloth-note/signing/updater.key'),
      what: 'chave privada que assina as atualizações (essencial)',
    },
    {
      file: 'updater.key.pub',
      path: join(home, '.local/share/sloth-note/signing/updater.key.pub'),
      what: 'chave pública das atualizações',
    },
    {
      file: 'android-debug.keystore',
      path: join(home, '.android/debug.keystore'),
      what: 'chave que assina o APK; sem ela o app não atualiza no celular (essencial)',
    },
    {
      file: 'recovery-key.txt',
      path: join(home, '.config/sloth-note/recovery-key.txt'),
      what: 'chave de recuperação das notas no servidor',
    },
    {
      file: 'sync-secret.json',
      path: join(home, '.config/sloth-note/sync-secret.json'),
      what: 'conexão antiga de sincronização (servidor, chave de acesso e de criptografia)',
    },
    {
      file: 'sync-token',
      path: join(home, '.config/sloth-note/sync-token'),
      what: 'chave de acesso antiga do servidor',
    },
    {
      file: 'android-env.sh',
      path: join(home, '.config/sloth-note/android-env.sh'),
      what: 'caminhos do SDK e do JDK do Android',
    },
    {
      file: 'server.dev.vars',
      path: join(repo, 'server/.dev.vars'),
      what: 'segredos do servidor local (wrangler dev)',
    },
    {
      file: 'wrangler.local.toml',
      path: join(repo, 'server/wrangler.local.toml'),
      what: 'ID real do banco D1 usado no deploy e no admin.js',
    },
  ]
}

const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  )
const same = async (a, b) => {
  const [x, y] = await Promise.all([readFile(a), readFile(b)])
  return x.equals(y)
}

function checkFolder(folder, repo) {
  const target = resolve(folder)
  const inside = relative(repo, target)
  const ignored = basename(target) === DEFAULT_FOLDER
  if (!ignored && !inside.startsWith('..') && !inside.startsWith(sep) && inside !== target)
    throw new Error(
      `a pasta ${target} fica dentro do repositório; escolha uma pasta fora dele ou use o nome padrão ${DEFAULT_FOLDER}, que o git ignora.`,
    )
  return target
}

/** Copies every credential that exists into `folder` (700, files 600) with a manifest. */
export async function save(folder, { home = homedir(), repo = REPO, log = console.log } = {}) {
  const target = checkFolder(folder, repo)
  await mkdir(target, { recursive: true, mode: 0o700 })
  await chmod(target, 0o700)
  const saved = []
  for (const item of credentials(home, repo)) {
    if (!(await exists(item.path))) {
      log(`  falta     ${item.file} (${item.path} não existe)`)
      continue
    }
    const destination = join(target, item.file)
    await copyFile(item.path, destination)
    await chmod(destination, 0o600)
    saved.push({
      file: item.file,
      path: relative(home, item.path).replaceAll('\\', '/'),
      what: item.what,
    })
    log(`  guardado  ${item.file}`)
  }
  const manifest = {
    app: 'Sloth Note',
    savedAt: new Date().toISOString(),
    note: 'Segredos em arquivos comuns. Guarde esta pasta fora do repositório, em armazenamento cifrado.',
    files: saved,
  }
  await writeFile(join(target, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  })
  log(`${saved.length} credenciais em ${target}`)
  return saved
}

/**
 * Puts each file of the folder back in place. A different file already in place is kept
 * unless `force`, so a restore never silently replaces a newer key.
 */
export async function restore(
  folder,
  { home = homedir(), repo = REPO, force = false, log = console.log } = {},
) {
  const source = resolve(folder)
  if (!(await exists(join(source, MANIFEST))))
    throw new Error(`${source} não tem ${MANIFEST}; use a pasta criada por "credentials:save".`)
  const result = { restored: [], same: [], kept: [] }
  for (const item of credentials(home, repo)) {
    const from = join(source, item.file)
    if (!(await exists(from))) continue
    if (await exists(item.path)) {
      if (await same(from, item.path)) {
        result.same.push(item.file)
        log(`  igual     ${item.file}`)
        continue
      }
      if (!force) {
        result.kept.push(item.file)
        log(`  mantido   ${item.file}: já existe um arquivo diferente em ${item.path}`)
        continue
      }
    }
    await mkdir(dirname(item.path), { recursive: true, mode: 0o700 })
    await copyFile(from, item.path)
    await chmod(item.path, item.file.endsWith('.pub') ? 0o644 : 0o600)
    result.restored.push(item.file)
    log(`  colocado  ${item.file} → ${item.path}`)
  }
  if (result.kept.length)
    log(
      `${result.kept.length} arquivo(s) diferente(s) mantido(s). Confira e rode com --forcar para substituir.`,
    )
  return result
}

const HELP = `Credenciais de desenvolvimento do Sloth Note.

  bun run credentials:save [pasta]      copia todas as credenciais para a pasta
  bun run credentials:restore [pasta]   coloca cada uma de volta no lugar
                                        (--forcar substitui arquivos diferentes)

Sem pasta, usa ${DEFAULT_FOLDER} no diretório atual (o git ignora esse nome).
A pasta guarda segredos sem cifra: deixe-a fora do repositório, num local cifrado.`

async function main([command, ...rest]) {
  const flags = rest.filter((arg) => arg.startsWith('--'))
  const folder = rest.find((arg) => !arg.startsWith('--')) ?? join(process.cwd(), DEFAULT_FOLDER)
  if (!['save', 'restore'].includes(command)) {
    console.log(HELP)
    return command ? 1 : 0
  }
  if (command === 'save') await save(folder)
  else await restore(folder, { force: flags.includes('--forcar') })
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (error) => {
      console.error(`Erro: ${error.message}`)
      process.exitCode = 1
    },
  )
}
