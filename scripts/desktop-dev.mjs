import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createServer } from 'vite'

export async function startFrontend(port = 5173) {
  const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: false } })
  try {
    await server.listen()
    const address = server.httpServer.address()
    return { server, url: `http://127.0.0.1:${address.port}` }
  } catch (error) {
    await server.close()
    throw error
  }
}

export function desktopConfig(url, csp) {
  const websocket = url.replace(/^http:/, 'ws:')
  return {
    build: { beforeDevCommand: '', devUrl: url },
    app: {
      security: {
        devCsp: csp.replace(
          /connect-src[^;]*/,
          `connect-src ipc: http://ipc.localhost ${url} ${websocket}`,
        ),
      },
    },
  }
}

/**
 * Runs `tauri dev` and starts it again while the app asks for a restart (profile switch)
 * by writing `restartFile`. The frontend server keeps running between runs.
 */
export async function runDesktop({ launch, restartFile, maxRestarts = 20 }) {
  for (let run = 0; ; run++) {
    await rm(restartFile, { force: true })
    const code = await launch()
    const requested = await readFile(restartFile, 'utf8').then(
      () => true,
      () => false,
    )
    if (!requested || run >= maxRestarts) return code
    console.log('Desktop: reiniciando para trocar de perfil…')
  }
}

async function main() {
  const { server, url } = await startFrontend()
  console.log(`Desktop: ${url}`)
  const config = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  )
  const folder = await mkdtemp(join(tmpdir(), 'sloth-dev-'))
  const restartFile = join(folder, 'restart')
  let child = null
  const stop = () => child?.kill('SIGTERM')
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const launch = () =>
    new Promise((resolve, reject) => {
      child = spawn(
        process.execPath,
        [
          fileURLToPath(new URL('./tauri-cli.mjs', import.meta.url)),
          'dev',
          '--config',
          JSON.stringify(desktopConfig(url, config.app.security.csp)),
          ...process.argv.slice(2),
        ],
        { stdio: 'inherit', env: { ...process.env, SLOTH_DEV_RESTART_FILE: restartFile } },
      )
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)))
    })
  try {
    process.exitCode = await runDesktop({ launch, restartFile })
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    await server.close()
    await rm(folder, { recursive: true, force: true })
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
