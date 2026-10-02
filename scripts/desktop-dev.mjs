import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
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

async function main() {
  const { server, url } = await startFrontend()
  console.log(`Desktop: ${url}`)
  const config = JSON.parse(
    await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
  )
  const require = createRequire(import.meta.url)
  const child = spawn(
    process.execPath,
    [
      require.resolve('@tauri-apps/cli/tauri.js'),
      'dev',
      '--config',
      JSON.stringify(desktopConfig(url, config.app.security.csp)),
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' },
  )
  const stop = () => child.kill('SIGTERM')
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', (code, signal) => resolve(code ?? (signal ? 130 : 1)))
    })
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    await server.close()
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
