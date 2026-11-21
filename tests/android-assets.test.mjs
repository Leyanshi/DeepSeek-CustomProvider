import assert from 'node:assert/strict'
import test from 'node:test'
import { unzipSync, zipSync } from 'fflate'
import { normalizeApkEntries, verifyApkAssets } from '../scripts/android-assets.mjs'

const text = (value) => Buffer.from(value)

test('Windows aapt2 assets survive a ZIP round trip at Android request paths', () => {
  const expected = {
    'index.html': text('<script src="static/startup.js"></script>'),
    'static/startup.js': text('window.started = true'),
    'static/js/main.test.js': text('main bundle'),
    'static/js/async/markdown.test.js': text('async bundle'),
    'static/css/main.test.css': text('body { color: gray }'),
    'static/media/font.test.woff2': new Uint8Array([0, 255, 1, 128]),
  }
  const windowsEntries = Object.fromEntries(
    Object.entries(expected).map(([name, content]) => [
      `assets/${name.replaceAll('/', '\\')}`,
      content,
    ])
  )
  const raw = unzipSync(zipSync(windowsEntries))
  assert.throws(() => verifyApkAssets(raw, expected), /Windows separator/)
  const fixed = unzipSync(zipSync(normalizeApkEntries(raw)))
  verifyApkAssets(fixed, expected)
  assert.equal(Buffer.from(fixed['assets/static/startup.js']).toString(), 'window.started = true')
})

test('existing Android resource paths and compression options stay valid', () => {
  const entries = {
    'res/drawable/ic_launcher.xml': text('vector'),
    'resources.arsc': [new Uint8Array([1, 2, 3]), { level: 0 }],
  }
  const packaged = unzipSync(zipSync(normalizeApkEntries(entries)))
  assert.deepEqual(Buffer.from(packaged['resources.arsc']), Buffer.from([1, 2, 3]))
  assert.equal(Buffer.from(packaged['res/drawable/ic_launcher.xml']).toString(), 'vector')
})

test('colliding normalized paths stop the build instead of dropping an asset', () => {
  assert.throws(
    () =>
      normalizeApkEntries({
        'assets/static/startup.js': text('new'),
        'assets/static\\startup.js': text('old'),
      }),
    /Duplicate APK path/
  )
})

test('a missing bootstrap prevents successful asset verification', () => {
  assert.throws(
    () =>
      verifyApkAssets(
        { 'assets/index.html': text('html') },
        {
          'index.html': text('html'),
          'static/startup.js': text('bootstrap'),
        }
      ),
    /Missing bundled web asset: static\/startup\.js/
  )
})

test('a stale bundled script prevents successful asset verification', () => {
  assert.throws(
    () =>
      verifyApkAssets(
        { 'assets/static/startup.js': text('old') },
        {
          'static/startup.js': text('new'),
        }
      ),
    /differs from build/
  )
})
