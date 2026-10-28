import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const cli = require('@tauri-apps/cli')

// Pass arguments explicitly: the upstream launcher does not recognize bun.native.exe.
cli.run(process.argv.slice(2), 'tauri').catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
