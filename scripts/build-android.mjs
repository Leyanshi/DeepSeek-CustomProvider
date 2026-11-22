import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, zipSync } from 'fflate'
import { writeBrandAssets } from './brand-assets.mjs'
import { normalizeApkEntries, verifyApkAssets } from './android-assets.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
writeBrandAssets()
const tools = path.join(root, '.android-tools')
const build = path.join(root, 'android/build')
const sdkJar = path.join(tools, 'android.jar')
const javaRoot = process.env.DS_ANDROID_JAVA_HOME || process.env.JAVA_HOME
const java = (name) =>
  javaRoot
    ? path.join(javaRoot, 'bin', `${name}${process.platform === 'win32' ? '.exe' : ''}`)
    : name
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${path.basename(command)} failed (${result.status})`)
  }
}

// Download only two SDK archives, then retain the individual files this build needs.
// No sdkmanager, IDE, Gradle daemon, emulator, NDK or global installation.
const downloads = [
  {
    file: 'platform-35-ext15_r01.zip',
    sha1: 'ce757091f933b7ac646bf197ce8957cc73b95614',
    select: (name) => (name.endsWith('/android.jar') ? 'android.jar' : null),
  },
  {
    file: 'build-tools_r35_windows.zip',
    sha1: 'af059bb67cf7786f45ee0db85e2d24985df1b4b6',
    select: (name) => {
      if (/\/(aapt2\.exe|zipalign\.exe|libwinpthread-1\.dll)$/.test(name)) {
        return path.basename(name)
      }
      if (/\/lib\/(d8|apksigner)\.jar$/.test(name)) {
        return `lib/${path.basename(name)}`
      }
      return null
    },
  },
]
if (process.platform !== 'win32') {
  throw new Error('This minimal tool bootstrap currently supports a Windows build host.')
}
mkdirSync(tools, { recursive: true })
if (!existsSync(path.join(tools, 'READY'))) {
  for (const archive of downloads) {
    const cache = path.join(root, 'tmp/android-tools', archive.file)
    mkdirSync(path.dirname(cache), { recursive: true })
    if (!existsSync(cache)) {
      process.stdout.write(`Downloading ${archive.file}\n`)
      const response = await fetch(`https://dl.google.com/android/repository/${archive.file}`, {
        signal: AbortSignal.timeout(240000),
      })
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`)
      }
      writeFileSync(cache, Buffer.from(await response.arrayBuffer()))
    }
    const data = readFileSync(cache)
    if (createHash('sha1').update(data).digest('hex') !== archive.sha1) {
      throw new Error(`Checksum mismatch: ${archive.file}`)
    }
    const files = unzipSync(data, { filter: (entry) => Boolean(archive.select(entry.name)) })
    for (const [name, content] of Object.entries(files)) {
      const destination = path.join(tools, archive.select(name))
      mkdirSync(path.dirname(destination), { recursive: true })
      writeFileSync(destination, content)
    }
  }
  for (const name of [
    'android.jar',
    'aapt2.exe',
    'zipalign.exe',
    'lib/d8.jar',
    'lib/apksigner.jar',
  ]) {
    if (!existsSync(path.join(tools, name))) {
      throw new Error(`Missing build tool: ${name}`)
    }
  }
  writeFileSync(path.join(tools, 'READY'), 'Android platform 35 / build tools 35.0.0\n')
}

mkdirSync(build, { recursive: true })
const generated = path.join(build, 'generated')
const classes = path.join(build, 'classes')
const dex = path.join(build, 'dex')
for (const directory of [generated, classes, dex]) {
  mkdirSync(directory, { recursive: true })
}
run(path.join(tools, 'aapt2.exe'), [
  'compile',
  '--dir',
  'android/res',
  '-o',
  path.join(build, 'resources.zip'),
])
run(path.join(tools, 'aapt2.exe'), [
  'link',
  '-I',
  sdkJar,
  '--manifest',
  'android/AndroidManifest.xml',
  '--min-sdk-version',
  '26',
  '--target-sdk-version',
  '35',
  '--version-code',
  '10',
  '--version-name',
  version,
  '--java',
  generated,
  '-A',
  'dist',
  '-o',
  path.join(build, 'resources.apk'),
  path.join(build, 'resources.zip'),
])
const filesUnder = (directory, suffix) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory()
      ? filesUnder(filename, suffix)
      : filename.endsWith(suffix)
        ? [filename]
        : []
  })
run(java('javac'), [
  '-encoding',
  'UTF-8',
  '--release',
  '8',
  '-classpath',
  sdkJar,
  '-d',
  classes,
  ...filesUnder(path.join(root, 'android/src'), '.java'),
  ...filesUnder(generated, '.java'),
])
const classArchive = path.join(build, 'classes.jar')
run(java('jar'), ['cf', classArchive, '-C', classes, '.'])
run(java('java'), [
  '-cp',
  path.join(tools, 'lib/d8.jar'),
  'com.android.tools.r8.D8',
  '--release',
  '--min-api',
  '26',
  '--lib',
  sdkJar,
  '--output',
  dex,
  classArchive,
])
const apkEntries = normalizeApkEntries(unzipSync(readFileSync(path.join(build, 'resources.apk'))))
// Android 11+ requires resources.arsc to be uncompressed and aligned.
apkEntries['resources.arsc'] = [apkEntries['resources.arsc'], { level: 0 }]
apkEntries['classes.dex'] = new Uint8Array(readFileSync(path.join(dex, 'classes.dex')))
writeFileSync(path.join(build, 'unsigned.apk'), zipSync(apkEntries, { level: 9 }))
run(path.join(tools, 'zipalign.exe'), [
  '-f',
  '-p',
  '4',
  path.join(build, 'unsigned.apk'),
  path.join(build, 'aligned.apk'),
])

const signing = path.join(root, 'android/.signing')
mkdirSync(signing, { recursive: true })
const passwordFile = path.join(signing, 'password.txt')
const keystore = path.join(signing, 'release.jks')
if (!existsSync(passwordFile)) {
  writeFileSync(passwordFile, randomBytes(24).toString('hex'), { mode: 0o600 })
}
const env = {
  ...process.env,
  DS_ANDROID_SIGNING_PASSWORD: readFileSync(passwordFile, 'utf8').trim(),
}
if (!existsSync(keystore)) {
  run(
    java('keytool'),
    [
      '-genkeypair',
      '-keystore',
      keystore,
      '-storepass:env',
      'DS_ANDROID_SIGNING_PASSWORD',
      '-keypass:env',
      'DS_ANDROID_SIGNING_PASSWORD',
      '-alias',
      'deepseek',
      '-keyalg',
      'RSA',
      '-keysize',
      '2048',
      '-validity',
      '10000',
      '-dname',
      'CN=DeepSeek Community, OU=Community App, O=Local Build, C=CN',
    ],
    { env }
  )
}
const output = path.join(root, `release/DeepSeek-Android-${version}.apk`)
mkdirSync(path.dirname(output), { recursive: true })
run(
  java('java'),
  [
    '-jar',
    path.join(tools, 'lib/apksigner.jar'),
    'sign',
    '--ks',
    keystore,
    '--ks-key-alias',
    'deepseek',
    '--ks-pass',
    'env:DS_ANDROID_SIGNING_PASSWORD',
    '--key-pass',
    'env:DS_ANDROID_SIGNING_PASSWORD',
    '--out',
    output,
    path.join(build, 'aligned.apk'),
  ],
  { env }
)
run(java('java'), ['-jar', path.join(tools, 'lib/apksigner.jar'), 'verify', '--verbose', output])
const webRoot = path.join(root, 'dist')
const expectedAssets = Object.fromEntries(
  filesUnder(webRoot, '').map((filename) => [
    path.relative(webRoot, filename).split(path.sep).join('/'),
    readFileSync(filename),
  ])
)
verifyApkAssets(unzipSync(readFileSync(output)), expectedAssets)
process.stdout.write(
  `Verified all ${Object.keys(expectedAssets).length} bundled web assets and Android ZIP paths.\n`
)
run(path.join(tools, 'zipalign.exe'), ['-c', '-p', '4', output])
run(path.join(tools, 'aapt2.exe'), ['dump', 'badging', output])
writeFileSync(
  `${output}.sha256`,
  `${createHash('sha256').update(readFileSync(output)).digest('hex')}  ${path.basename(output)}\n`
)
process.stdout.write(
  `APK ready: ${output} (${(readFileSync(output).length / 1048576).toFixed(2)} MB)\n`
)
