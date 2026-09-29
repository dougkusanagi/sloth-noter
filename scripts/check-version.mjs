// A versão vive em package.json; o Cargo.toml precisa acompanhá-la (tauri.conf.json a lê de lá).
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version
const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8').match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const tag = process.argv[2]?.replace(/^v/, '')

const errors = []
if (cargo !== pkg) errors.push(`src-tauri/Cargo.toml (${cargo}) difere de package.json (${pkg})`)
if (tag && tag !== pkg) errors.push(`a tag (${tag}) difere de package.json (${pkg})`)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`versão ${pkg}`)
