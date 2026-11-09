import { spawn } from 'node:child_process'
import { copyFile, mkdir, readdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const android = path.join(root, 'src-tauri', 'gen', 'android')
const version = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version
async function exportApk(source) {
  const destination = path.join(
    android,
    'app',
    'build',
    'outputs',
    'apk',
    `sloth-note-${version}-android-arm64-debug.apk`,
  )
  await copyFile(source, destination)
  console.log(`APK: ${destination}`)
}
const env = { ...process.env, VITE_TARGET: 'mobile' }
// Android devices with 16 KB pages require ELF segments aligned to 16 KB.
env.CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS = [
  env.CARGO_TARGET_AARCH64_LINUX_ANDROID_RUSTFLAGS,
  '-C link-arg=-Wl,-z,max-page-size=16384',
]
  .filter(Boolean)
  .join(' ')
if (process.platform === 'win32') {
  env.PATH = `${path.join(env.USERPROFILE, '.cargo', 'bin')};${env.PATH}`
  env.ANDROID_HOME ||= path.join(env.LOCALAPPDATA, 'Android', 'Sdk')
  // Gradle 8 requires a supported JDK; recent Android Studio versions ship JDK 25.
  const microsoft = path.join(env.ProgramFiles, 'Microsoft')
  const jdks = existsSync(microsoft) ? await readdir(microsoft) : []
  const jdk = jdks.find((name) => name.startsWith('jdk-21.'))
  env.JAVA_HOME ||= jdk
    ? path.join(microsoft, jdk)
    : path.join(env.ProgramFiles, 'Android', 'Android Studio', 'jbr')
}

async function run(command, args, cwd = root) {
  let output = ''
  const child = spawn(command, args, { cwd, env, stdio: ['inherit', 'pipe', 'pipe'] })
  for (const [stream, destination] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    stream.on('data', (chunk) => {
      output += chunk.toString()
      destination.write(chunk)
    })
  }
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  })
  return { code, output }
}

const result = await run('bun', [
  'tauri',
  'android',
  'build',
  '--debug',
  '--target',
  'aarch64',
  '--apk',
  '--ci',
])
if (result.code === 0) {
  await exportApk(
    path.join(
      android,
      'app',
      'build',
      'outputs',
      'apk',
      'universal',
      'debug',
      'app-universal-debug.apk',
    ),
  )
  process.exit(0)
}
if (
  process.platform !== 'win32' ||
  !result.output.includes('Creation symbolic link is not allowed')
) {
  process.exit(result.code || 1)
}

// Tauri has already compiled the library. Copy it and package it without repeating
// the Rust task when Windows Developer Mode is unavailable.
const jni = path.join(android, 'app', 'src', 'main', 'jniLibs', 'arm64-v8a')
await mkdir(jni, { recursive: true })
await copyFile(
  path.join(root, 'src-tauri', 'target', 'aarch64-linux-android', 'debug', 'libsloth_note_lib.so'),
  path.join(jni, 'libsloth_note_lib.so'),
)
const packaged = await run(
  env.ComSpec || 'cmd.exe',
  ['/d', '/c', '.\\gradlew.bat assembleArm64Debug -x rustBuildArm64Debug --console=plain'],
  android,
)
if (packaged.code !== 0) process.exit(packaged.code || 1)
await exportApk(
  path.join(android, 'app', 'build', 'outputs', 'apk', 'arm64', 'debug', 'app-arm64-debug.apk'),
)
