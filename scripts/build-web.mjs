import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { writeNotices } from './write-notices.mjs'
import { writeBrandAssets } from './brand-assets.mjs'

const require = createRequire(import.meta.url)
const android = process.argv.includes('--android')
writeBrandAssets()
const result = spawnSync(
  process.execPath,
  [
    path.join(path.dirname(require.resolve('@rspack/cli/package.json')), 'bin/rspack.js'),
    'build',
    '-c',
    'rspack.config.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      ...(android ? { CHAT_DEMO_API_ORIGIN: 'https://appassets.androidplatform.net/api' } : {}),
    },
  }
)
if (result.error) {
  throw result.error
}
if (result.status === 0) {
  writeNotices()
}
process.exit(result.status ?? 1)
