/** Windows aapt2 can emit backslashes in asset names; Android opens ZIP paths with '/'. */
export const normalizeApkEntries = (entries) => {
  const normalized = Object.create(null)
  for (const [name, content] of Object.entries(entries)) {
    const androidPath = name.replaceAll('\\', '/')
    if (Object.hasOwn(normalized, androidPath)) {
      throw new Error(`Duplicate APK path after normalization: ${androidPath}`)
    }
    normalized[androidPath] = content
  }
  return normalized
}

/** Check the actual archive against every file the web build produced. */
export const verifyApkAssets = (entries, expected) => {
  for (const name of Object.keys(entries)) {
    if (name.includes('\\')) {
      throw new Error(`APK path contains a Windows separator: ${name}`)
    }
  }
  for (const [relative, content] of Object.entries(expected)) {
    const actual = entries[`assets/${relative}`]
    if (!actual) {
      throw new Error(`Missing bundled web asset: ${relative}`)
    }
    if (!Buffer.from(actual).equals(Buffer.from(content))) {
      throw new Error(`Bundled web asset differs from build: ${relative}`)
    }
  }
}
