import { createId } from '../utils/id.js'

/** The Android shell exposes a small bridge only to its bundled HTTPS document. */
type AndroidBridge = {
  request: (payload: string) => void
  cancelRequest: (id: string) => void
  beginFile: (id: string, name: string, type: string) => boolean
  writeFileChunk: (id: string, data: string) => boolean
  finishFile: (id: string, preview: boolean) => void
  cancelFile: (id: string) => void
  openLink: (url: string) => void
  setTheme: (dark: boolean) => void
  systemDark: () => boolean
}

declare global {
  interface Window {
    DeepSeekAndroid?: AndroidBridge
  }
}

const ORIGIN = 'https://appassets.androidplatform.net'
const bridge = () => (location.origin === ORIGIN ? window.DeepSeekAndroid : undefined)
export const isAndroidApp = () => Boolean(bridge())
const encode = (bytes: Uint8Array) => {
  let text = ''
  for (let start = 0; start < bytes.length; start += 16384) {
    text += String.fromCharCode(...bytes.subarray(start, start + 16384))
  }
  return btoa(text)
}
const decode = (text: string) => Uint8Array.from(atob(text), (char) => char.charCodeAt(0))

type Pending = {
  resolve: (response: Response) => void
  reject: (error: Error) => void
  controller: ReadableStreamDefaultController<Uint8Array>
  stream: ReadableStream<Uint8Array>
  cleanup: () => void
  responded: boolean
}
type NativeEvent = {
  id: string
  type: 'headers' | 'data' | 'end' | 'error' | 'file'
  status?: number
  headers?: Record<string, string>
  data?: string
  message?: string
  success?: boolean
}
const pending = new Map<string, Pending>()
const fileResults = new Map<string, (error?: Error) => void>()
let listening = false
const listen = () => {
  if (listening) {
    return
  }
  listening = true
  window.addEventListener('deepseek-native', (event) => {
    const detail = (event as CustomEvent<NativeEvent>).detail
    if (detail.type === 'file') {
      const complete = fileResults.get(detail.id)
      fileResults.delete(detail.id)
      complete?.(detail.success ? undefined : new Error(detail.message || '文件保存失败'))
      return
    }
    const job = pending.get(detail.id)
    if (!job) {
      return
    }
    try {
      if (detail.type === 'headers') {
        const status = detail.status || 200
        job.resolve(
          new Response([204, 205, 304].includes(status) ? null : job.stream, {
            status,
            headers: detail.headers,
          })
        )
        job.responded = true
      } else if (detail.type === 'data') {
        job.controller.enqueue(decode(detail.data || ''))
      } else if (detail.type === 'end') {
        job.controller.close()
        job.cleanup()
      } else if (detail.type === 'error') {
        const error = new Error(
          detail.message || '无法连接 API 服务，请检查 Base URL 和网络后重试。'
        )
        if (job.responded) {
          job.controller.error(error)
        } else {
          job.reject(error)
        }
        job.cleanup()
      }
    } catch (error) {
      job.reject(error instanceof Error ? error : new Error(String(error)))
      job.cleanup()
      bridge()?.cancelRequest(detail.id)
    }
  })
}

/** Native HTTPS transport preserves binary uploads, SSE, audio and AbortSignal. */
export const androidFetch = async (
  url: string,
  init: RequestInit,
  baseUrl: string
): Promise<Response> => {
  const native = bridge()
  if (!native) {
    return fetch(url, init)
  }
  if (!url.startsWith(`${ORIGIN}/api/`)) {
    throw new Error('不允许访问此 API 地址')
  }
  listen()
  const request = new Request(url, init)
  const bytes = request.body ? new Uint8Array(await request.arrayBuffer()) : new Uint8Array()
  if (bytes.length > 32 * 1024 * 1024) {
    throw new Error('上传文件过大，单次请求请控制在 32 MB 以内')
  }
  if (init.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
  const id = createId()
  return new Promise<Response>((resolve, reject) => {
    const cleanup = () => {
      pending.delete(id)
      init.signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      const error = new DOMException('Aborted', 'AbortError')
      const job = pending.get(id)
      if (job?.responded) {
        job.controller.error(error)
      } else {
        reject(error)
      }
      cleanup()
      native.cancelRequest(id)
    }
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller
      },
      cancel() {
        cleanup()
        native.cancelRequest(id)
      },
    })
    if (!streamController) {
      reject(new Error('无法创建响应流'))
      return
    }
    pending.set(id, {
      resolve,
      reject,
      controller: streamController,
      stream,
      cleanup,
      responded: false,
    })
    init.signal?.addEventListener('abort', abort, { once: true })
    try {
      native.request(
        JSON.stringify({
          id,
          url,
          baseUrl,
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
          body: encode(bytes),
        })
      )
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

/** Chunked native saves keep large ZIP exports out of a single bridge message. */
export const saveAndroidFile = async (blob: Blob, name: string, preview = false) => {
  const native = bridge()
  if (!native) {
    throw new Error('Android 文件保存接口不可用')
  }
  listen()
  const id = createId()
  if (!native.beginFile(id, name, blob.type || 'application/octet-stream')) {
    throw new Error('暂时无法创建文件，请重试')
  }
  try {
    for (let start = 0; start < blob.size; start += 48 * 1024) {
      const bytes = new Uint8Array(await blob.slice(start, start + 48 * 1024).arrayBuffer())
      if (!native.writeFileChunk(id, encode(bytes))) {
        throw new Error('文件未能写入，请检查剩余空间')
      }
    }
    await new Promise<void>((resolve, reject) => {
      fileResults.set(id, (error) => (error ? reject(error) : resolve()))
      native.finishFile(id, preview)
    })
  } catch (error) {
    fileResults.delete(id)
    native.cancelFile(id)
    throw error
  }
}

export const syncAndroidTheme = (dark: boolean) => bridge()?.setTheme(dark)
export const androidSystemDark = () => bridge()?.systemDark()

/** Local attachment previews use Android's viewer; remote links use the browser. */
export const setupAndroid = () => {
  if (!bridge()) {
    return
  }
  listen()
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a') : null
    if (!link) {
      return
    }
    if (/^https?:/.test(link.href) && new URL(link.href).origin !== ORIGIN) {
      event.preventDefault()
      bridge()?.openLink(link.href)
      return
    }
    if (!/^(blob:|data:)/.test(link.href)) {
      return
    }
    event.preventDefault()
    void fetch(link.href)
      .then((response) => response.blob())
      .then((blob) =>
        saveAndroidFile(
          blob,
          link.download || (blob.type === 'application/pdf' ? '附件.pdf' : '附件.png'),
          !link.download
        )
      )
      .catch(() => {
        /* Native save errors are shown by the Android shell. */
      })
  })
}
