import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const writeNotices = () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const seen = new Set()
  const notices = []
  const findPackage = (name, parent) => {
    const require = createRequire(parent)
    for (const directory of require.resolve.paths(name) || []) {
      const manifest = path.join(directory, name, 'package.json')
      if (existsSync(manifest)) {
        return realpathSync(manifest)
      }
    }
    throw new Error(`Cannot locate license for ${name}`)
  }
  const visit = (manifest) => {
    manifest = realpathSync(manifest)
    if (seen.has(manifest)) {
      return
    }
    seen.add(manifest)
    const pkg = JSON.parse(readFileSync(manifest, 'utf8'))
    const directory = path.dirname(manifest)
    if (manifest !== path.join(root, 'package.json')) {
      const licenseFiles = readdirSync(directory, { withFileTypes: true }).filter(
        (file) => file.isFile() && /^(licen[cs]e|copying|notice|ofl)([.-]|$)/i.test(file.name)
      )
      const texts = licenseFiles.map((file) =>
        readFileSync(path.join(directory, file.name), 'utf8')
      )
      notices.push(
        `${pkg.name} ${pkg.version}\nLicense: ${typeof pkg.license === 'string' ? pkg.license : 'See license below'}\n\n${texts.join('\n\n')}`
      )
    }
    for (const name of Object.keys(pkg.dependencies || {})) {
      if (!name.startsWith('@types/')) {
        visit(findPackage(name, manifest))
      }
    }
  }
  visit(path.join(root, 'package.json'))
  visit(findPackage('@swc/helpers', path.join(root, 'package.json')))
  notices.sort()
  writeFileSync(
    path.join(root, 'dist/THIRD-PARTY-NOTICES.txt'),
    `Third-party software bundled with DeepSeek\n\n${notices.join('\n\n' + '='.repeat(80) + '\n\n')}`
  )
}
