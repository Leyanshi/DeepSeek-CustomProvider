import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Keep the web favicon and Android vector based on the bundled DeepSeek SVG. */
export const writeBrandAssets = () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const source = readFileSync(path.join(root, 'resources/deepseek.svg'), 'utf8')
  const shape = source.match(/<path\b[^>]*\/>/g)
  const pathData = shape?.[0].match(/\bd="([^"]+)"/)?.[1]
  const fill = shape?.[0].match(/\bfill="(#[0-9a-f]{6})"/i)?.[1]
  if (!source.includes('viewBox="0 0 50 50"') || shape?.length !== 1 || !pathData || !fill) {
    throw new Error('Expected the original DeepSeek 50 × 50 single-path SVG')
  }
  writeFileSync(
    path.join(root, 'resources/deepseek-app-icon.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="108" height="108" viewBox="0 0 108 108">
  <rect x="6" y="6" width="96" height="96" rx="18" fill="#FFFFFF" />
  <g transform="translate(14 14) scale(1.6)">
    ${shape[0]}
  </g>
</svg>
`
  )
  writeFileSync(
    path.join(root, 'android/res/drawable/ic_launcher.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="#FFFFFF" android:pathData="M24,6 L84,6 Q102,6 102,24 L102,84 Q102,102 84,102 L24,102 Q6,102 6,84 L6,24 Q6,6 24,6 Z" />
  <group android:scaleX="1.6" android:scaleY="1.6" android:translateX="14" android:translateY="14">
    <path android:fillColor="${fill}" android:fillType="nonZero" android:pathData="${pathData}" />
  </group>
</vector>
`
  )
}
