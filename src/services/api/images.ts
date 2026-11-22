import { resizeUploadImage } from '../../utils/resizeUploadImage.js'
import type { InlineImageBlockParam } from './types.js'

/** Send a local image in Messages format, without requiring a provider's Files API. */
export const inlineImage = async (
  blob: Blob,
  name: string,
  mimeType: string,
  signal: AbortSignal
): Promise<InlineImageBlockParam> => {
  const image = await resizeUploadImage(
    new File([blob], name, { type: blob.type || mimeType }),
    signal
  )
  const bytes = new Uint8Array(await image.arrayBuffer())
  signal.throwIfAborted()
  let binary = ''
  for (let start = 0; start < bytes.length; start += 16384) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 16384))
  }
  return { type: 'image', source: { type: 'base64', media_type: image.type, data: btoa(binary) } }
}
