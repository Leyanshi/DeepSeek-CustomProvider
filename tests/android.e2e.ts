import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'

const localPolicy = (
  await readFile('android/src/com/chatdemo/deepseek/android/MainActivity.java', 'utf8')
).match(/headers\.put\("Content-Security-Policy", "([^"]+)"\)/)?.[1]
if (!localPolicy) {
  throw new Error('Android content policy is missing')
}
const apkAssets = process.env.DS_ANDROID_TEST_APK
  ? unzipSync(new Uint8Array(await readFile(process.env.DS_ANDROID_TEST_APK)))
  : undefined

type Harness = {
  requests: {
    id: string
    url: string
    baseUrl: string
    method: string
    headers: Record<string, string>
    body: string
  }[]
  cancelled: string[]
  titleRequests: Harness['requests']
  titleStatus: number
  titleText: string
  titleDelay: number
  saved: { name: string; type: string; chunks: string[] }[]
  links: string[]
  dark: boolean
  readyCalls: number
  startupErrors: string[]
  modelResponse: unknown
  modelStatus: number
  webStatus: number
  fetchStatus: number
  mcpFormat: 'json' | 'sse'
  mcpStructured: boolean
  mcpStatus: number
  mcpError: 'none' | 'rpc' | 'tool' | 'malformed'
  mcpDelay: number
  mcpSession: string
  mcpVersion: string
  audioStatus: number
  audioFormat: 'pcm' | 'wav'
  audioEndDelay: number
  rejectThinking: boolean
  chatStatus: number
  stopReason: 'end_turn' | 'max_tokens'
}
declare global {
  interface Window {
    AndroidTest: Harness
    __deepseekStartupPhase?: string
  }
}

test.beforeEach(async ({ page }) => {
  await page.route('https://appassets.androidplatform.net/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const filename = path.join(process.cwd(), 'dist', pathname === '/' ? 'index.html' : pathname)
    const types: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
    }
    try {
      const body = apkAssets
        ? apkAssets[`assets${pathname === '/' ? '/index.html' : pathname}`]
        : await readFile(filename)
      if (!body) {
        throw new Error('Requested asset is missing from the APK')
      }
      await route.fulfill({
        body: Buffer.from(new Uint8Array(body)),
        contentType: types[path.extname(filename)] || 'application/octet-stream',
        headers: { 'Content-Security-Policy': localPolicy, 'X-Content-Type-Options': 'nosniff' },
      })
    } catch {
      await route.fulfill({ status: 404, body: '' })
    }
  })
  await page.addInitScript(() => {
    const harness: Harness = {
      requests: [],
      cancelled: [],
      titleRequests: [],
      titleStatus: 200,
      titleText: '安卓验证对话',
      titleDelay: 0,
      saved: [],
      links: [],
      dark: false,
      readyCalls: 0,
      startupErrors: [],
      modelResponse: {
        data: [
          { id: 'deepseek-flash' },
          { id: 'deepseek-v4-pro' },
          { id: 'provider/custom-chat', display_name: 'Custom Chat' },
        ],
      },
      modelStatus: 200,
      webStatus: 200,
      fetchStatus: 200,
      mcpFormat: 'sse',
      mcpStructured: true,
      mcpStatus: 200,
      mcpError: 'none',
      mcpDelay: 0,
      mcpSession: '',
      mcpVersion: '2025-11-25',
      audioStatus: 200,
      audioFormat: 'pcm',
      audioEndDelay: 40,
      rejectThinking: false,
      chatStatus: 200,
      stopReason: 'end_turn',
    }
    window.AndroidTest = harness
    const jobs = new Map<string, { name: string; type: string; chunks: string[] }>()
    const emit = (detail: Record<string, unknown>) =>
      window.dispatchEvent(new CustomEvent('deepseek-native', { detail }))
    const data = (id: string, text: string) =>
      emit({ id, type: 'data', data: btoa(String.fromCharCode(...new TextEncoder().encode(text))) })
    window.DeepSeekAndroid = {
      appReady() {
        harness.readyCalls++
      },
      startupFailed(message: string) {
        harness.startupErrors.push(message)
      },
      request(payload: string) {
        const request = JSON.parse(payload)
        const isTitle =
          request.url.endsWith('/messages') &&
          JSON.parse(
            new TextDecoder().decode(Uint8Array.from(atob(request.body), (c) => c.charCodeAt(0)))
          ).max_tokens === 96
        ;(isTitle ? harness.titleRequests : harness.requests).push(request)
        const id = request.id
        setTimeout(() => {
          if (request.url.endsWith('/models')) {
            if (request.baseUrl === 'https://unavailable.example') {
              emit({
                id,
                type: 'headers',
                status: 401,
                headers: { 'content-type': 'application/json' },
              })
              data(id, JSON.stringify({ error: { message: 'Invalid API key for this server' } }))
              emit({ id, type: 'end' })
              return
            }
            emit({
              id,
              type: 'headers',
              status: harness.modelStatus,
              headers: { 'content-type': 'application/json' },
            })
            data(id, JSON.stringify(harness.modelResponse))
            emit({ id, type: 'end' })
          } else if (request.url.endsWith('/api/mcp')) {
            const rpc = JSON.parse(
              new TextDecoder().decode(Uint8Array.from(atob(request.body), (c) => c.charCodeAt(0)))
            )
            if (rpc.method === 'notifications/initialized') {
              emit({
                id,
                type: 'headers',
                status: 202,
                headers: { 'content-type': 'application/json' },
              })
              emit({ id, type: 'end' })
              return
            }
            setTimeout(() => {
              if (harness.cancelled.includes(id)) {
                return
              }
              let result: unknown
              if (rpc.method === 'initialize') {
                result = {
                  protocolVersion: harness.mcpVersion,
                  capabilities: { tools: {} },
                  serverInfo: { name: 'grok-search-rs', version: '0.1.26' },
                }
              } else if (rpc.params.name === 'web_search') {
                result = {
                  content: 'Grok 整理摘要：最新发布已确认，来源如下。',
                  sources: [
                    {
                      url: 'https://grok-news.example/article',
                      title: 'Grok 联网资料',
                      description: 'Grok 来源摘要',
                      provider: 'grok',
                      published_date: '2026-11-22',
                    },
                  ],
                  session_id: 'search-session',
                  sources_count: 1,
                }
              } else {
                result = {
                  url: rpc.params.arguments.url,
                  content: '# Grok 网页正文\nGrok Fetch 返回的独立正文。',
                  source_type: 'generic',
                  original_length: 42,
                  truncated: false,
                }
              }
              const toolResult = {
                ...(harness.mcpStructured ? { structuredContent: result } : {}),
                content: [{ type: 'text', text: JSON.stringify(result) }],
              }
              const body =
                rpc.method === 'initialize'
                  ? { jsonrpc: '2.0', id: rpc.id, result }
                  : harness.mcpError === 'rpc'
                    ? {
                        jsonrpc: '2.0',
                        id: rpc.id,
                        error: { code: -32603, message: 'Source unavailable' },
                      }
                    : harness.mcpError === 'malformed'
                      ? { jsonrpc: '2.0', id: 'unrelated-id', result: toolResult }
                      : {
                          jsonrpc: '2.0',
                          id: rpc.id,
                          result: { ...toolResult, isError: harness.mcpError === 'tool' },
                        }
              emit({
                id,
                type: 'headers',
                status: harness.mcpStatus,
                headers: {
                  'content-type':
                    harness.mcpFormat === 'sse' ? 'text/event-stream' : 'application/json',
                  ...(harness.mcpSession ? { 'mcp-session-id': harness.mcpSession } : {}),
                },
              })
              const text =
                harness.mcpFormat === 'sse'
                  ? `: keepalive\r\nevent: message\r\ndata: ${JSON.stringify(body)}\r\n\r\n`
                  : JSON.stringify(body)
              // Exercise SSE framing and Unicode across native response chunks.
              const bytes = new TextEncoder().encode(text)
              for (let start = 0; start < bytes.length; start += 17) {
                emit({
                  id,
                  type: 'data',
                  data: btoa(String.fromCharCode(...bytes.subarray(start, start + 17))),
                })
              }
              emit({ id, type: 'end' })
            }, harness.mcpDelay)
          } else if (
            request.url.endsWith('/tools/search') ||
            request.url.endsWith('/tools/fetch')
          ) {
            const searching = request.url.endsWith('/tools/search')
            const status = searching ? harness.webStatus : harness.fetchStatus
            emit({ id, type: 'headers', status, headers: { 'content-type': 'application/json' } })
            data(
              id,
              JSON.stringify(
                status === 200
                  ? searching
                    ? {
                        results: [
                          {
                            title: '联网资料标题',
                            url: 'https://news.example/article',
                            snippet: '展示摘要',
                            summary: '搜索长摘要：确认版本已经更新。',
                            content: '',
                            site_name: 'Example News',
                            site_icon: null,
                            date: '2026-11-22T00:00:00Z',
                          },
                        ],
                      }
                    : { title: '网页正文标题', content: '# 抓取正文\n抓取的独立资料内容。' }
                  : { error: { message: 'Web service unavailable' } }
              )
            )
            emit({ id, type: 'end' })
          } else if (request.url.endsWith('/tools/tts') || request.url.endsWith('/audio/speech')) {
            const wav = harness.audioFormat === 'wav'
            emit({
              id,
              type: 'headers',
              status: harness.audioStatus,
              headers: {
                'content-type':
                  harness.audioStatus === 200
                    ? wav
                      ? 'audio/wav'
                      : 'audio/pcm'
                    : 'application/json',
              },
            })
            if (harness.audioStatus !== 200) {
              data(id, JSON.stringify({ error: { message: 'Audio service failed' } }))
              emit({ id, type: 'end' })
              return
            }
            const bytes = new Uint8Array(48000 + (wav ? 44 : 0))
            const view = new DataView(bytes.buffer)
            if (wav) {
              const label = (offset: number, value: string) =>
                [...value].forEach((char, i) => (bytes[offset + i] = char.charCodeAt(0)))
              label(0, 'RIFF')
              view.setUint32(4, bytes.length - 8, true)
              label(8, 'WAVE')
              label(12, 'fmt ')
              view.setUint32(16, 16, true)
              view.setUint16(20, 1, true)
              view.setUint16(22, 1, true)
              view.setUint32(24, 24000, true)
              view.setUint32(28, 48000, true)
              view.setUint16(32, 2, true)
              view.setUint16(34, 16, true)
              label(36, 'data')
              view.setUint32(40, 48000, true)
            }
            for (let i = 0; i < 24000; i++) {
              view.setInt16((wav ? 44 : 0) + i * 2, Math.sin(i / 10) * 1000, true)
            }
            for (let start = 0; start < bytes.length; start += 10001) {
              const chunk = bytes.subarray(start, start + 10001)
              emit({ id, type: 'data', data: btoa(String.fromCharCode(...chunk)) })
            }
            setTimeout(() => {
              if (!harness.cancelled.includes(id)) {
                emit({ id, type: 'end' })
              }
            }, harness.audioEndDelay)
          } else if (
            request.url.endsWith('/tools/asr') ||
            request.url.endsWith('/audio/transcriptions')
          ) {
            emit({
              id,
              type: 'headers',
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
            data(id, JSON.stringify({ text: '语音识别得到的测试文字', duration_ms: 1000 }))
            emit({ id, type: 'end' })
          } else if (request.url.endsWith('/files')) {
            emit({
              id,
              type: 'headers',
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
            data(
              id,
              JSON.stringify({
                id: 'file-android-test',
                type: 'file',
                size_bytes: 8,
                created_at: '2026-11-21',
                filename: 'test.txt',
                mime_type: 'text/plain',
              })
            )
            emit({ id, type: 'end' })
          } else {
            const body = JSON.parse(atob(request.body))
            if (
              (isTitle && harness.titleStatus !== 200) ||
              (!isTitle &&
                (harness.chatStatus !== 200 ||
                  (harness.rejectThinking && body.thinking !== undefined)))
            ) {
              emit({
                id,
                type: 'headers',
                status: isTitle
                  ? harness.titleStatus
                  : harness.chatStatus !== 200
                    ? harness.chatStatus
                    : 400,
                headers: { 'content-type': 'application/json' },
              })
              data(
                id,
                JSON.stringify({
                  error: {
                    message: "Unsupported parameter 'thinking' for this model",
                    param: 'thinking',
                  },
                })
              )
              emit({ id, type: 'end' })
              return
            }
            emit({
              id,
              type: 'headers',
              status: 200,
              headers: { 'content-type': 'text/event-stream' },
            })
            const events = [
              {
                type: 'message_start',
                message: { id: 'android-test', model: JSON.parse(atob(request.body)).model },
              },
              { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
              {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: isTitle
                    ? harness.titleText
                    : '安卓聊天验证成功。\n\n公式：$E=mc^2$\n\n[DeepSeek 官网](https://www.deepseek.com)',
                },
              },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: {
                  stop_reason: isTitle ? 'end_turn' : harness.stopReason,
                  stop_sequence: null,
                  title: '安卓验证对话',
                },
              },
              { type: 'message_stop' },
            ]
            events.forEach((event, index) =>
              setTimeout(
                () => {
                  if (harness.cancelled.includes(id)) {
                    return
                  }
                  data(id, `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
                  if (index === events.length - 1) {
                    emit({ id, type: 'end' })
                  }
                },
                index * 70 + (isTitle ? harness.titleDelay : 0)
              )
            )
          }
        }, 15)
      },
      cancelRequest(id: string) {
        harness.cancelled.push(id)
      },
      beginFile(id: string, name: string, type: string) {
        jobs.set(id, { name, type, chunks: [] })
        return true
      },
      writeFileChunk(id: string, data: string) {
        jobs.get(id)?.chunks.push(data)
        return true
      },
      finishFile(id: string) {
        const file = jobs.get(id)
        if (file) {
          harness.saved.push(file)
        }
        emit({ id, type: 'file', success: true })
      },
      cancelFile(id: string) {
        jobs.delete(id)
      },
      setTheme(dark: boolean) {
        harness.dark = dark
      },
      systemDark() {
        return false
      },
      openLink(url: string) {
        harness.links.push(url)
      },
    }
  })
  await page.goto('https://appassets.androidplatform.net/index.html')
  await page.getByPlaceholder('请输入 API Key').fill('sk-android-test-only')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByPlaceholder('请输入 API Key')).not.toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
})

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 1366 },
  { width: 1366, height: 1024 },
]) {
  test(`sidebar moves through intermediate positions at ${viewport.width}px and remains usable`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize(viewport)
    const wide = viewport.width >= 768
    const panel = page.locator(`[data-sider-layout="${wide ? 'docked' : 'drawer'}"]`)
    if (wide) {
      await page.getByRole('button', { name: '收起边栏', exact: true }).click()
    }
    await expect
      .poll(() =>
        panel.evaluate((element, wide) => {
          const rect = element.getBoundingClientRect()
          return Math.round(wide ? rect.width : rect.right)
        }, wide)
      )
      .toBe(0)

    const move = (open: boolean) =>
      page.evaluate(
        async ({ wide, open }) => {
          const element = document.querySelector(
            `[data-sider-layout="${wide ? 'docked' : 'drawer'}"]`
          )
          const main = document.querySelector('main')
          const button = document.querySelector<HTMLButtonElement>(
            `button[aria-label="${open ? '打开边栏' : '收起边栏'}"]`
          )
          if (!element || !main || !button) {
            throw new Error('Sidebar controls missing')
          }
          const capture = () => {
            const rect = element.getBoundingClientRect()
            return { reveal: wide ? rect.width : rect.right, mainX: main.getBoundingClientRect().x }
          }
          const frames = [capture()]
          button.click()
          const start = performance.now()
          do {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
            frames.push(capture())
          } while (performance.now() - start < 450)
          return frames
        },
        { wide, open }
      )

    const width = wide ? 261 : 300
    const opened = await move(true)
    expect(opened[0].reveal).toBeCloseTo(0)
    expect(opened.some((frame) => frame.reveal > 1 && frame.reveal < width - 1)).toBe(true)
    expect(opened.at(-1)?.reveal).toBeCloseTo(width)
    expect(opened.at(-1)?.mainX).toBeCloseTo(wide ? width : 0)
    await page.screenshot({ path: `test-results/sidebar-${viewport.width}.png` })
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()
    const closed = await move(false)
    expect(closed.some((frame) => frame.reveal > 1 && frame.reveal < width - 1)).toBe(true)
    expect(closed.at(-1)?.reveal).toBeCloseTo(0)
    await expect(page.locator('[data-android-back]')).toHaveCount(0)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reduced = await move(true)
    expect(reduced.some((frame) => frame.reveal > 1 && frame.reveal < width - 1)).toBe(false)
    expect(reduced.at(-1)?.reveal).toBeCloseTo(width)
    await move(false)
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    if (wide) {
      await page.reload()
      await expect(page.getByRole('button', { name: '打开边栏', exact: true })).toBeVisible()
    }
    await page.locator('textarea').fill('侧栏动画后仍能发送消息')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  })

  test(`settings animates in and out at ${viewport.width}px and resets dismissed drafts`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize(viewport)
    if (viewport.width < 768) {
      await page.getByRole('button', { name: '打开边栏', exact: true }).click()
    }
    await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible()

    const animate = (action: 'open' | 'close' | 'escape' | 'backdrop') =>
      page.evaluate(async (action) => {
        let panel = document.querySelector<HTMLElement>('[role="dialog"]')
        if (action === 'open') {
          const settings = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
            (button) => button.textContent?.trim() === '设置'
          )
          if (!settings) {
            throw new Error('Settings button missing')
          }
          settings.click()
        } else {
          if (!panel) {
            throw new Error('Settings dialog missing')
          }
          if (action === 'escape') {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
          } else if (action === 'backdrop') {
            panel.parentElement?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
          } else {
            panel.querySelector<HTMLButtonElement>('[aria-label="关闭"]')?.click()
          }
        }
        const frames: {
          opacity: number
          top: number
          height: number
          width: number
          connected: boolean
        }[] = []
        const start = performance.now()
        do {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
          panel ??= document.querySelector<HTMLElement>('[role="dialog"]')
          const overlay = panel?.parentElement
          if (panel && overlay && panel.isConnected) {
            const rect = panel.getBoundingClientRect()
            frames.push({
              opacity: Number(getComputedStyle(overlay).opacity),
              top: rect.top,
              height: rect.height,
              width: rect.width,
              connected: true,
            })
          } else {
            frames.push({ opacity: 0, top: 0, height: 0, width: 0, connected: false })
          }
        } while (performance.now() - start < 450)
        return frames
      }, action)

    const opened = await animate('open')
    expect(opened.some((frame) => frame.opacity > 0.01 && frame.opacity < 0.99)).toBe(true)
    expect(opened.at(-1)?.opacity).toBe(1)
    const visible = opened.at(-1)
    if (!visible) {
      throw new Error('Animation frames missing')
    }
    if (viewport.width < 768) {
      expect(opened.some((frame) => frame.connected && frame.top > visible.top + 10)).toBe(true)
    } else {
      expect(opened.some((frame) => frame.connected && frame.width < visible.width - 1)).toBe(true)
    }
    await page.screenshot({ path: `test-results/settings-${viewport.width}.png` })
    await page.getByRole('tab', { name: '数据管理' }).click()
    await page.getByLabel('Base URL', { exact: true }).fill('https://unsaved-settings.example')
    const closed = await animate('close')
    expect(closed.some((frame) => frame.opacity > 0.01 && frame.opacity < 0.99)).toBe(true)
    expect(closed.at(-1)?.connected).toBe(false)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await animate('open')
    await page.getByRole('tab', { name: '数据管理' }).click()
    await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue(
      'https://api.deepseek.com'
    )
    const escape = await animate('escape')
    expect(escape.some((frame) => frame.opacity > 0.01 && frame.opacity < 0.99)).toBe(true)
    expect(escape.at(-1)?.connected).toBe(false)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reduced = await animate('open')
    expect(reduced.some((frame) => frame.opacity > 0.01 && frame.opacity < 0.99)).toBe(false)
    expect(reduced.at(-1)?.opacity).toBe(1)
    await animate('backdrop')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}

test('settings dismissal respects the top confirmation and reopening during exit stays usable', async ({
  page,
}) => {
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('tab', { name: '数据管理' })).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(async () => {
    document.querySelector<HTMLButtonElement>('[role="dialog"] [aria-label="关闭"]')?.click()
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const settings = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === '设置'
    )
    settings?.click()
  })
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.getByRole('tab', { name: '联网与语音' }).click()
  await expect(page.getByRole('button', { name: '保存联网设置' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  await page.locator('textarea').fill('关闭设置后继续聊天')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
})

test('Android mobile chat, binary upload, export, theme and browser links', async ({ page }) => {
  await expect.poll(() => page.evaluate(() => window.AndroidTest.readyCalls)).toBe(1)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.screenshot({ path: 'test-results/android-welcome.png' })
  await page.locator('input[type=file][multiple]').setInputFiles({
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('安卓附件内容'),
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.AndroidTest.requests.some((request) => request.url.endsWith('/files'))
      )
    )
    .toBe(true)
  await page.locator('textarea').fill('验证 Android 聊天')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await expect(page.locator('.katex').first()).toBeVisible()
  const upload = await page.evaluate(() =>
    window.AndroidTest.requests.find((request) => request.url.endsWith('/files'))
  )
  expect(upload?.headers['content-type']).toMatch(/multipart\/form-data; boundary=/)
  expect(Buffer.from(upload?.body || '', 'base64').toString()).toContain('安卓附件内容')
  await page.getByRole('link', { name: 'DeepSeek 官网' }).click()
  expect(await page.evaluate(() => window.AndroidTest.links)).toEqual(['https://www.deepseek.com/'])
  // On mobile, the settings entry is inside the drawer.
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.screenshot({ path: 'test-results/android-logo.png' })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('radio', { name: '深色', exact: true }).click()
  expect(await page.evaluate(() => window.AndroidTest.dark)).toBe(true)
  await page.getByRole('tab', { name: '数据管理' }).click()
  await page.getByRole('button', { name: '下载', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.AndroidTest.saved.length)).toBe(1)
  const saved = (await page.evaluate(() => window.AndroidTest.saved))[0]
  expect(saved.name).toMatch(/\.zip$/)
  const zip = Buffer.concat(
    saved.chunks.map((chunk) => new Uint8Array(Buffer.from(chunk, 'base64')))
  )
  const files = unzipSync(new Uint8Array(zip))
  expect(Object.keys(files).length).toBeGreaterThan(0)
  expect(zip.toString()).not.toContain('sk-android-test-only')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('[data-android-back]').click({ position: { x: 380, y: 10 }, force: true })
  await page.screenshot({ path: 'test-results/android-chat.png' })
  await page.reload()
  await expect(page.locator('body')).toHaveClass(/dark/)
  await expect(page.getByRole('dialog')).not.toBeVisible()
  expect(errors).toEqual([])
})

test('stopping a streaming Android reply cancels the native network request', async ({ page }) => {
  await page.locator('textarea').fill('测试停止生成')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.AndroidTest.requests.filter(
            (request) =>
              request.url.endsWith('/messages') && window.AndroidTest.cancelled.includes(request.id)
          ).length
      )
    )
    .toBe(1)
})

test('images send inline without Files API and survive history reload', async ({ page }) => {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64'
  )
  await page.locator('input[type=file][multiple]').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: image,
  })
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  const first = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
  )
  const body = JSON.parse(Buffer.from(first[0].body, 'base64').toString())
  expect(body.messages.at(-1).content[0]).toEqual({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: image.toString('base64') },
  })
  expect(first[0].headers['anthropic-beta']).toBeUndefined()
  expect(
    await page.evaluate(() => window.AndroidTest.requests.some((r) => r.url.endsWith('/files')))
  ).toBe(false)
  await page.reload()
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByText('安卓验证对话', { exact: true }).click()
  await page.locator('textarea').fill('继续看这张图片')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const history = await page.evaluate(() =>
    window.AndroidTest.requests.find((r) => r.url.endsWith('/messages'))
  )
  const historyBody = JSON.parse(Buffer.from(history?.body || '', 'base64').toString())
  expect(
    historyBody.messages.find((m: { role: string }) => m.role === 'user').content[0].source.data
  ).toBe(image.toString('base64'))
  expect(
    await page.evaluate(() => window.AndroidTest.requests.some((r) => r.url.endsWith('/files')))
  ).toBe(false)
})

test('Search and Fetch use an independent API and send real sources to chat', async ({ page }) => {
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '联网与语音' }).click()
  await page.getByLabel('联网 API 来源', { exact: true }).selectOption('custom')
  await page.getByLabel('服务 Base URL', { exact: true }).fill('https://web.example/v1/')
  await page.getByLabel('服务 API Key', { exact: true }).fill('sk-web-test')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.reload()
  await page.getByRole('button', { name: '智能搜索', exact: true }).click()
  await page.locator('textarea').fill('查看最新版本 https://docs.example/update')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const requests = await page.evaluate(() => window.AndroidTest.requests)
  const search = requests.find((r) => r.url.endsWith('/tools/search'))
  if (!search) {
    throw new Error('Search request missing')
  }
  expect(search.baseUrl).toBe('https://web.example/v1')
  expect(search.headers.authorization).toBe('Bearer sk-web-test')
  expect(JSON.parse(Buffer.from(search.body, 'base64').toString()).query).toContain('查看最新版本')
  const fetches = requests.filter((r) => r.url.endsWith('/tools/fetch'))
  expect(
    fetches.map((r) => JSON.parse(Buffer.from(r.body, 'base64').toString()).url).sort()
  ).toEqual(['https://docs.example/update', 'https://news.example/article'])
  expect(
    fetches.every(
      (r) => r.baseUrl === search.baseUrl && r.headers.authorization === 'Bearer sk-web-test'
    )
  ).toBe(true)
  const chat = requests.find((r) => r.url.endsWith('/messages'))
  if (!chat) {
    throw new Error('Chat request missing')
  }
  expect(chat.baseUrl).toBe('https://api.deepseek.com')
  expect(chat.headers['x-api-key']).toBe('sk-android-test-only')
  const body = JSON.parse(Buffer.from(chat.body, 'base64').toString())
  expect(body.messages.at(-1).content).toContain('搜索长摘要')
  expect(body.messages.at(-1).content).toContain('抓取的独立资料内容')
  expect(body.tools).toEqual([])
  await page.getByText('已阅读 1 个网页', { exact: true }).click()
  await expect(page.getByText('联网资料标题', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await page.getByRole('button', { name: '下载', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.AndroidTest.saved.length)).toBe(1)
  const saved = (await page.evaluate(() => window.AndroidTest.saved))[0]
  const zip = Buffer.concat(
    saved.chunks.map((chunk) => new Uint8Array(Buffer.from(chunk, 'base64')))
  )
  const entries = unzipSync(new Uint8Array(zip))
  const session = Object.entries(entries).find(([name]) => name.startsWith('chat_sessions/'))?.[1]
  const sessionBody = JSON.parse(Buffer.from(new Uint8Array(session ?? [])).toString())
  expect(
    sessionBody.messages.find((m: { role: string }) => m.role === 'ASSISTANT')
      .custom_provider_web_context
  ).toContain('抓取的独立资料内容')
  expect(zip.toString()).not.toContain('sk-web-test')
  await page
    .locator('input[type=file][accept^=".zip"]')
    .setInputFiles({ name: 'history.zip', mimeType: 'application/zip', buffer: zip })
  await page.getByRole('button', { name: '确认导入', exact: true }).click()
  await expect(page.getByText('已导入 1 个对话', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByText('安卓验证对话', { exact: true }).click()
  await page.locator('textarea').fill('继续使用刚才的网页资料')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const afterImport = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages')).at(-1)
  )
  const importedBody = JSON.parse(Buffer.from(afterImport?.body ?? '', 'base64').toString())
  expect(importedBody.messages.find((m: { role: string }) => m.role === 'user').content).toContain(
    '抓取的独立资料内容'
  )
})

test('unavailable web services still answer without claiming live verification', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AndroidTest.webStatus = 503
    window.AndroidTest.fetchStatus = 503
  })
  await page.getByRole('button', { name: '智能搜索', exact: true }).click()
  await page.locator('textarea').fill('查询 https://unavailable.example/info')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  const requests = await page.evaluate(() => window.AndroidTest.requests)
  expect(requests.some((r) => r.url.endsWith('/tools/search'))).toBe(true)
  expect(requests.some((r) => r.url.endsWith('/tools/fetch'))).toBe(true)
  const body = JSON.parse(
    Buffer.from(requests.find((r) => r.url.endsWith('/messages'))?.body ?? '', 'base64').toString()
  )
  expect(body.messages.at(-1).content).toContain('没有取得可用网页资料')
  expect(body.messages.at(-1).content).toContain('不能声称已核实实时信息')
})

test('Fetch reads explicit links with search off and can be disabled in settings', async ({
  page,
}) => {
  await page.locator('textarea').fill('请读 https://docs.example/page')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(() =>
      window.AndroidTest.requests.some((r) => r.url.endsWith('/tools/search'))
    )
  ).toBe(false)
  expect(
    await page.evaluate(() =>
      window.AndroidTest.requests.some((r) => r.url.endsWith('/tools/fetch'))
    )
  ).toBe(true)
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '联网与语音' }).click()
  await page.getByLabel('读取消息中的链接和前两个搜索结果的网页正文', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  await page.locator('textarea').fill('再读 https://docs.example/another')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  expect(
    await page.evaluate(
      () => window.AndroidTest.requests.filter((r) => r.url.endsWith('/tools/fetch')).length
    )
  ).toBe(1)
  const latest = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages')).at(-1)
  )
  const body = JSON.parse(Buffer.from(latest?.body ?? '', 'base64').toString())
  expect(body.messages.find((m: { role: string }) => m.role === 'user').content).toContain(
    '抓取的独立资料内容'
  )
})

const openWebSettings = async (page: Page) => {
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '联网与语音' }).click()
}

const configureGrok = async (page: Page) => {
  await openWebSettings(page)
  await page.getByLabel('联网 API 来源', { exact: true }).selectOption('grok')
  await page.getByLabel('Grok API Key', { exact: true }).fill('xai-test-grok')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.reload()
}

const requestBody = (request?: Harness['requests'][number]) =>
  JSON.parse(Buffer.from(request?.body ?? '', 'base64').toString())

test('GrokSearch MCP SSE sends independent keys and preserves sources and summary across reload', async ({
  page,
}) => {
  await openWebSettings(page)
  await page.getByLabel('联网 API 来源', { exact: true }).selectOption('grok')
  await page.getByLabel('MCP 完整地址', { exact: true }).fill('https://mcp.example/proxy/grok/mcp/')
  await page.getByLabel('Grok API Key', { exact: true }).fill('xai-test-grok')
  await page
    .getByLabel('Grok Base URL（可选）', { exact: true })
    .fill('https://grok-gateway.example/v1/')
  await page
    .getByLabel('Grok 搜索模型 ID（可选）', { exact: true })
    .fill('grok-provider/search-model')
  await page.getByText('网页来源与 MCP 鉴权（可选）', { exact: true }).click()
  for (const label of [
    'Tavily API Key',
    'Exa API Key',
    'TinyFish API Key',
    'Firecrawl API Key',
    'GitHub Token',
  ]) {
    await page.getByLabel(label, { exact: true }).fill(`test-${label.split(' ')[0]}`)
  }
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.reload()
  await page.getByRole('button', { name: '智能搜索', exact: true }).click()
  const question = '搜索完整长提问'.repeat(40) + ' https://docs.example/grok'
  await page.locator('textarea').fill(question)
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const requests = await page.evaluate(() => window.AndroidTest.requests)
  const mcp = requests.filter((r) => r.url.endsWith('/api/mcp'))
  expect(mcp.map((r) => requestBody(r).method)).toEqual([
    'initialize',
    'notifications/initialized',
    'tools/call',
    'tools/call',
    'tools/call',
  ])
  expect(mcp.every((r) => r.baseUrl === 'https://mcp.example/proxy/grok/mcp')).toBe(true)
  for (const r of mcp) {
    expect(r.headers['x-grok-api-key']).toBe('xai-test-grok')
    expect(r.headers['x-grok-base-url']).toBe('https://grok-gateway.example/v1')
    expect(r.headers['x-grok-model']).toBe('grok-provider/search-model')
    expect(r.headers['x-tavily-api-key']).toBe('test-Tavily')
    expect(r.headers['x-exa-api-key']).toBe('test-Exa')
    expect(r.headers['x-tinyfish-api-key']).toBe('test-TinyFish')
    expect(r.headers['x-firecrawl-api-key']).toBe('test-Firecrawl')
    expect(r.headers['x-github-token']).toBe('test-GitHub')
    expect(r.headers.authorization).toBeUndefined()
    expect(r.headers['x-api-key']).toBeUndefined()
    expect(JSON.stringify(r)).not.toContain('sk-android-test-only')
  }
  expect(requestBody(mcp[2]).params).toEqual({
    name: 'web_search',
    arguments: { query: question, response_format: 'concise' },
  })
  expect(
    mcp
      .slice(3)
      .map((r) => requestBody(r).params.arguments.url)
      .sort()
  ).toEqual(['https://docs.example/grok', 'https://grok-news.example/article'])
  expect(mcp.slice(3).every((r) => requestBody(r).params.arguments.max_chars === 24000)).toBe(true)
  const chat = requests.find((r) => r.url.endsWith('/messages'))
  expect(chat?.baseUrl).toBe('https://api.deepseek.com')
  const content = requestBody(chat).messages.at(-1).content
  expect(content).toContain('Grok 整理摘要')
  expect(content).toContain('Grok 来源摘要')
  expect(content).toContain('Grok Fetch 返回的独立正文')
  await page.getByText('已阅读 1 个网页', { exact: true }).click()
  await expect(page.getByText('Grok 联网资料', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Grok 联网资料/ }).click()
  expect(await page.evaluate(() => window.AndroidTest.links)).toContain(
    'https://grok-news.example/article'
  )
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  // Each turn initializes with the current saved credentials; previous context remains available.
  await openWebSettings(page)
  await expect(page.getByLabel('联网 API 来源', { exact: true })).toHaveValue('grok')
  await expect(page.getByLabel('Grok API Key', { exact: true })).toHaveValue('xai-test-grok')
  await page.getByLabel('MCP 完整地址', { exact: true }).fill('https://other-mcp.example/custom')
  await page.getByLabel('Grok API Key', { exact: true }).fill('xai-new-key')
  await page
    .getByLabel('Grok Base URL（可选）', { exact: true })
    .fill('https://new-gateway.example')
  await page.getByLabel('Grok 搜索模型 ID（可选）', { exact: true }).fill('new-search-model')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.reload()
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByText('安卓验证对话', { exact: true }).click()
  await page.locator('textarea').fill('继续使用刚才的网页资料')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const after = await page.evaluate(() => window.AndroidTest.requests)
  const newMcp = after.filter((r) => r.url.endsWith('/api/mcp'))
  expect(requestBody(newMcp[0]).method).toBe('initialize')
  expect(
    newMcp.every(
      (r) =>
        r.baseUrl === 'https://other-mcp.example/custom' &&
        r.headers['x-grok-api-key'] === 'xai-new-key' &&
        r.headers['x-grok-model'] === 'new-search-model' &&
        r.headers['x-grok-base-url'] === 'https://new-gateway.example'
    )
  ).toBe(true)
  const historyMessages = requestBody(after.find((r) => r.url.endsWith('/messages'))).messages
  expect(historyMessages.find((m: { role: string }) => m.role === 'user').content).toContain(
    'Grok 整理摘要'
  )
})

test('GrokSearch JSON text results support fetch-only, default gateway and MCP sessions', async ({
  page,
}) => {
  await configureGrok(page)
  await openWebSettings(page)
  await page.getByText('网页来源与 MCP 鉴权（可选）', { exact: true }).click()
  await page.getByLabel('MCP 鉴权 Key', { exact: true }).fill('test-mcp-auth')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.reload()
  await page.evaluate(() => {
    window.AndroidTest.mcpFormat = 'json'
    window.AndroidTest.mcpStructured = false
    window.AndroidTest.mcpSession = 'mcp-test-session'
    window.AndroidTest.mcpVersion = '2025-06-18'
  })
  await page.locator('textarea').fill('读取 https://docs.example/fetch-only')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  const mcp = (await page.evaluate(() => window.AndroidTest.requests)).filter((r) =>
    r.url.endsWith('/api/mcp')
  )
  expect(mcp).toHaveLength(3)
  expect(mcp[0].baseUrl).toBe('https://mcp.episkeyai.com/groksearch_rs/mcp')
  expect(requestBody(mcp[1]).id).toBeUndefined()
  expect(requestBody(mcp[2]).params.name).toBe('web_fetch')
  expect(mcp[2].headers['mcp-protocol-version']).toBe('2025-06-18')
  expect(mcp[2].headers['mcp-session-id']).toBe('mcp-test-session')
  expect(mcp[2].headers.authorization).toBe('Bearer test-mcp-auth')
  expect(mcp[2].headers['x-grok-base-url']).toBeUndefined()
  expect(mcp[2].headers['x-grok-model']).toBeUndefined()
  const chat = await page.evaluate(() =>
    window.AndroidTest.requests.find((r) => r.url.endsWith('/messages'))
  )
  expect(requestBody(chat).messages.at(-1).content).toContain('Grok Fetch 返回的独立正文')
})

test('switching GrokSearch and DeepSeek preserves saved provider settings and validates Grok input', async ({
  page,
}) => {
  await openWebSettings(page)
  await page.getByLabel('联网 API 来源', { exact: true }).selectOption('custom')
  await page.getByLabel('服务 Base URL', { exact: true }).fill('https://web-saved.example/v1')
  await page.getByLabel('服务 API Key', { exact: true }).fill('sk-saved-web')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.getByLabel('联网 API 来源', { exact: true }).selectOption('grok')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await expect(page.getByRole('alert')).toContainText('请填写 Grok API Key')
  await page.getByLabel('Grok API Key', { exact: true }).fill('xai-test-grok')
  await page.getByLabel('MCP 完整地址', { exact: true }).fill('http://bad.example/mcp')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('MCP 完整地址', { exact: true }).fill('https://mcp.example/mcp')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.reload()
  await openWebSettings(page)
  await page.getByLabel('联网 API 来源', { exact: true }).selectOption('custom')
  await expect(page.getByLabel('服务 Base URL', { exact: true })).toHaveValue(
    'https://web-saved.example/v1'
  )
  await expect(page.getByLabel('服务 API Key', { exact: true })).toHaveValue('sk-saved-web')
  await page.getByRole('button', { name: '保存联网设置' }).click()
  await page.reload()
  await page.getByRole('button', { name: '智能搜索', exact: true }).click()
  await page.locator('textarea').fill('切回 DeepSeek 搜索')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  const requests = await page.evaluate(() => window.AndroidTest.requests)
  expect(requests.some((r) => r.url.endsWith('/api/mcp'))).toBe(false)
  expect(requests.find((r) => r.url.endsWith('/tools/search'))?.baseUrl).toBe(
    'https://web-saved.example/v1'
  )
  await openWebSettings(page)
  await page.getByLabel('联网 API 来源', { exact: true }).selectOption('grok')
  await expect(page.getByLabel('Grok API Key', { exact: true })).toHaveValue('xai-test-grok')
})

for (const error of ['rpc', 'tool', 'malformed'] as const) {
  test(`GrokSearch ${error} failures keep chat available and do not fabricate live sources`, async ({
    page,
  }) => {
    await configureGrok(page)
    await page.evaluate((error) => {
      window.AndroidTest.mcpError = error
    }, error)
    await page.getByRole('button', { name: '智能搜索', exact: true }).click()
    await page.locator('textarea').fill('搜索并读 https://unavailable.example/page')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
    const chat = await page.evaluate(() =>
      window.AndroidTest.requests.find((r) => r.url.endsWith('/messages'))
    )
    const content = requestBody(chat).messages.at(-1).content
    expect(content).toContain('没有取得可用网页资料')
    expect(content).not.toContain('Grok 整理摘要')
    expect(content).not.toContain('Grok Fetch 返回')
  })
}

test('GrokSearch HTTP authentication failure never falls back to the chat credentials', async ({
  page,
}) => {
  await configureGrok(page)
  await page.evaluate(() => {
    window.AndroidTest.mcpStatus = 401
  })
  await page.getByRole('button', { name: '智能搜索', exact: true }).click()
  await page.locator('textarea').fill('搜索测试')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  const requests = await page.evaluate(() => window.AndroidTest.requests)
  expect(requests.filter((r) => r.url.endsWith('/api/mcp'))).toHaveLength(1)
  expect(
    requests
      .filter((r) => r.url.endsWith('/api/mcp'))
      .some((r) => JSON.stringify(r).includes('sk-android-test-only'))
  ).toBe(false)
  expect(
    requestBody(requests.find((r) => r.url.endsWith('/messages'))).messages.at(-1).content
  ).toContain('没有取得可用网页资料')
})

test('stopping GrokSearch cancels MCP before any chat completion starts', async ({ page }) => {
  await configureGrok(page)
  await page.evaluate(() => {
    window.AndroidTest.mcpDelay = 500
  })
  await page.getByRole('button', { name: '智能搜索', exact: true }).click()
  await page.locator('textarea').fill('停止搜索测试')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () => window.AndroidTest.requests.filter((r) => r.url.endsWith('/api/mcp')).length
      )
    )
    .toBe(3)
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  expect(await page.evaluate(() => window.AndroidTest.cancelled.length)).toBeGreaterThan(0)
  expect(
    await page.evaluate(() => window.AndroidTest.requests.some((r) => r.url.endsWith('/messages')))
  ).toBe(false)
})

test('DeepSeek PCM speech handles odd chunks and an EOF after playback has ended', async ({
  page,
}) => {
  await page.locator('textarea').fill('测试朗读')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '朗读', exact: true })).toBeVisible()
  await page.evaluate(() => {
    window.AndroidTest.audioEndDelay = 1800
  })
  await page.getByRole('button', { name: '朗读', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止朗读', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '朗读', exact: true })).toBeVisible()
  const tts = await page.evaluate(() =>
    window.AndroidTest.requests.find((r) => r.url.endsWith('/tools/tts'))
  )
  expect(tts?.headers.authorization).toBe('Bearer sk-android-test-only')
  const body = JSON.parse(Buffer.from(tts?.body ?? '', 'base64').toString())
  expect(body.voice_id).toBe('stella')
  expect(body.format).toBe('pcm')
  expect(body.filter_markdown).toBe(true)
  expect(body.model).toBeUndefined()
})

test('WAV speech is decoded by its response type and a failed synthesis can be retried', async ({
  page,
}) => {
  await page.locator('textarea').fill('测试 WAV')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '朗读', exact: true })).toBeVisible()
  await page.evaluate(() => {
    window.AndroidTest.audioStatus = 503
  })
  await page.getByRole('button', { name: '朗读', exact: true }).click()
  await expect(page.getByText('朗读失败，请稍后再试', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '朗读', exact: true })).toBeVisible()
  await page.evaluate(() => {
    window.AndroidTest.audioStatus = 200
    window.AndroidTest.audioFormat = 'wav'
  })
  await page.getByRole('button', { name: '朗读', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止朗读', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '朗读', exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () => window.AndroidTest.requests.filter((r) => r.url.endsWith('/tools/tts')).length
    )
  ).toBe(2)
})

test('custom OpenAI speech models and voices persist and power TTS and microphone transcription', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone'])
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '联网与语音' }).click()
  const speech = page.getByRole('region', { name: '语音 API', exact: true })
  await speech.getByLabel('语音 API 来源', { exact: true }).selectOption('custom')
  await speech.getByLabel('服务 Base URL', { exact: true }).fill('https://speech.example/v1/')
  await speech.getByLabel('服务 API Key', { exact: true }).fill('sk-speech-test')
  await speech.getByLabel('语音接口格式', { exact: true }).selectOption('openai')
  await speech.getByRole('button', { name: '获取语音模型' }).click()
  await expect(speech.getByLabel('选择 TTS 模型', { exact: true })).toBeVisible()
  await speech.getByLabel('TTS 模型 ID', { exact: true }).fill('provider/custom-tts')
  await speech.getByLabel('语音识别模型 ID', { exact: true }).fill('provider/custom-asr')
  await speech.getByLabel('朗读音色', { exact: true }).fill('custom-voice')
  await speech.getByLabel('音频输出格式', { exact: true }).selectOption('wav')
  await speech.getByRole('button', { name: '保存语音设置' }).click()
  await page.screenshot({ path: 'test-results/android-speech-settings.png' })
  await page.reload()
  await page.locator('textarea').fill('使用自定义语音')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '朗读', exact: true })).toBeVisible()
  await page.evaluate(() => {
    window.AndroidTest.audioFormat = 'wav'
  })
  await page.getByRole('button', { name: '朗读', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止朗读', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '朗读', exact: true })).toBeVisible()
  const tts = await page.evaluate(() =>
    window.AndroidTest.requests.find((r) => r.url.endsWith('/audio/speech'))
  )
  expect(tts?.baseUrl).toBe('https://speech.example/v1')
  expect(tts?.headers.authorization).toBe('Bearer sk-speech-test')
  const body = JSON.parse(Buffer.from(tts?.body ?? '', 'base64').toString())
  expect(body.model).toBe('provider/custom-tts')
  expect(body.voice).toBe('custom-voice')
  expect(body.response_format).toBe('wav')
  expect(body.input).toContain('安卓聊天验证成功')
  await page.getByRole('button', { name: '语音输入', exact: true }).click()
  await expect(page.getByText(/录音中 [1-9]\d*s/)).toHaveText(/录音中 [1-9]\d*s/)
  await page.getByRole('button', { name: '结束录音并转写', exact: true }).click()
  await expect(page.locator('textarea')).toHaveValue('语音识别得到的测试文字')
  const asr = await page.evaluate(() =>
    window.AndroidTest.requests.find((r) => r.url.endsWith('/audio/transcriptions'))
  )
  expect(asr?.baseUrl).toBe('https://speech.example/v1')
  expect(asr?.headers.authorization).toBe('Bearer sk-speech-test')
  expect(asr?.headers['content-type']).toContain('multipart/form-data')
  const form = Buffer.from(asr?.body ?? '', 'base64').toString()
  expect(form).toContain('provider/custom-asr')
  expect(form).toContain('RIFF')
  expect(form).toContain('WAVE')
})

test('default DeepSeek voice input sends WAV to ASR and inserts the returned text', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['microphone'])
  await page.getByRole('button', { name: '语音输入', exact: true }).click()
  await expect(page.getByText(/录音中 [1-9]\d*s/)).toHaveText(/录音中 [1-9]\d*s/)
  await page.getByRole('button', { name: '结束录音并转写', exact: true }).click()
  await expect(page.locator('textarea')).toHaveValue('语音识别得到的测试文字')
  const asr = await page.evaluate(() =>
    window.AndroidTest.requests.find((r) => r.url.endsWith('/tools/asr'))
  )
  expect(asr?.headers.authorization).toBe('Bearer sk-android-test-only')
  expect(Buffer.from(asr?.body ?? '', 'base64').toString()).toContain('RIFF')
})

test('provider model metadata omits thinking even when DeepThink is enabled', async ({ page }) => {
  await page.evaluate(() => {
    window.AndroidTest.modelResponse = {
      data: [{ id: 'deepseek-flash', supported_parameters: ['temperature', 'tools'] }],
    }
    window.AndroidTest.rejectThinking = true
  })
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已获取 1 个模型')
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  await page.getByRole('button', { name: '深度思考', exact: true }).click()
  await page.locator('textarea').fill('该模型不支持思考设置')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  const chats = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
  )
  expect(chats).toHaveLength(1)
  expect(JSON.parse(Buffer.from(chats[0].body, 'base64').toString()).thinking).toBeUndefined()
  await expect(page.getByRole('button', { name: '深度思考', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

test('unsupported thinking retries without the parameter and remains omitted after toggling and reload', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AndroidTest.rejectThinking = true
  })
  await page.getByRole('button', { name: '深度思考', exact: true }).click()
  await page.locator('textarea').fill('首次检测不支持的参数')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  let chats = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
  )
  expect(chats).toHaveLength(2)
  expect(JSON.parse(Buffer.from(chats[0].body, 'base64').toString()).thinking).toEqual({
    type: 'enabled',
  })
  expect(JSON.parse(Buffer.from(chats[1].body, 'base64').toString()).thinking).toBeUndefined()
  await page.getByRole('button', { name: '深度思考', exact: true }).click()
  await page.locator('textarea').fill('关闭思考后也不发送此参数')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  chats = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
  )
  expect(chats).toHaveLength(3)
  expect(JSON.parse(Buffer.from(chats[2].body, 'base64').toString()).thinking).toBeUndefined()
  await page.reload()
  await page.evaluate(() => {
    window.AndroidTest.rejectThinking = true
  })
  await page.locator('textarea').fill('重启后仍然记住检测结果')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  chats = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
  )
  expect(chats).toHaveLength(1)
  expect(JSON.parse(Buffer.from(chats[0].body, 'base64').toString()).thinking).toBeUndefined()
})

test('authentication errors mentioning thinking are not automatically retried', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AndroidTest.chatStatus = 401
  })
  await page.locator('textarea').fill('验证鉴权失败不会触发参数降级')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(
    page.getByText('API Key 无效或已被删除，请更换后重试', { exact: false })
  ).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  expect(
    await page.evaluate(
      () => window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages')).length
    )
  ).toBe(1)
})

test('changing the model or API Key rechecks thinking support for the new connection', async ({
  page,
}) => {
  await page.evaluate(() => {
    window.AndroidTest.rejectThinking = true
  })
  await page.getByRole('button', { name: '深度思考', exact: true }).click()
  await page.locator('textarea').fill('先检测旧模型不支持')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const edit = async () => {
    await page.getByRole('button', { name: '打开边栏', exact: true }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '数据管理' }).click()
  }
  const close = async () => {
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  }
  await page.evaluate(() => {
    window.AndroidTest.rejectThinking = false
  })
  await edit()
  await page.getByLabel('自定义模型 ID', { exact: true }).fill('provider/different-model')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
  await close()
  await page.locator('textarea').fill('新模型支持思考')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  let chats = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
  )
  expect(JSON.parse(Buffer.from(chats.at(-1)?.body ?? '', 'base64').toString()).thinking).toEqual({
    type: 'enabled',
  })
  await edit()
  await page.getByLabel('自定义模型 ID', { exact: true }).fill('deepseek-flash')
  await page.getByRole('button', { name: '修改 API Key', exact: true }).click()
  await page.getByPlaceholder('请输入 API Key').fill('sk-new-route-test')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
  await close()
  await page.locator('textarea').fill('同一旧模型换 Key 后重新检测')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  chats = await page.evaluate(() =>
    window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
  )
  const last = chats.at(-1)
  expect(last?.headers['x-api-key']).toBe('sk-new-route-test')
  expect(JSON.parse(Buffer.from(last?.body ?? '', 'base64').toString()).thinking).toEqual({
    type: 'enabled',
  })
})

test('older WebView APIs still allow startup and native chat', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Intl, 'DisplayNames', { value: undefined, configurable: true })
    Object.defineProperty(Object, 'hasOwn', { value: undefined, configurable: true })
    for (const name of ['at', 'toSorted', 'toReversed']) {
      Object.defineProperty(Array.prototype, name, { value: undefined, configurable: true })
    }
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    const media = Object.getPrototypeOf(window.matchMedia('(min-width: 0px)'))
    Object.defineProperty(media, 'addEventListener', { value: undefined, configurable: true })
    Object.defineProperty(media, 'removeEventListener', { value: undefined, configurable: true })
  })
  await page.reload()
  await expect(page.locator('textarea')).toBeVisible()
  await page.locator('textarea').fill('旧内核兼容验证')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
})

test('WebView without dynamic viewport units keeps a full-height chat page', async ({ page }) => {
  await page.route('https://appassets.androidplatform.net/static/css/**', async (route) => {
    const filename = path.join(process.cwd(), 'dist', new URL(route.request().url()).pathname)
    const css = (await readFile(filename, 'utf8')).replaceAll('dvh', 'unsupportedvh')
    await route.fulfill({ body: css, contentType: 'text/css' })
  })
  await page.reload()
  await expect
    .poll(() => page.locator('main').evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(500)
  await expect(page.locator('textarea')).toBeVisible()
})

test('a failed startup script shows details and can reload without clearing settings', async ({
  page,
}) => {
  let failNext = true
  await page.route('https://appassets.androidplatform.net/static/js/main.*.js', async (route) => {
    if (!failNext) {
      await route.fallback()
      return
    }
    failNext = false
    await route.fulfill({
      body: "throw new Error('startup-test failure')",
      contentType: 'text/javascript',
    })
  })
  await page.reload()
  await expect(page.getByText('页面未能启动', { exact: true })).toBeVisible()
  await expect(page.locator('#startup-detail')).toContainText('startup-test failure')
  await page.screenshot({ path: 'test-results/android-startup-error.png' })
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.locator('textarea')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:api-key'))).toBe(
    'sk-android-test-only'
  )
})

test('loading stays visible until app mount reports readiness', async ({ page }) => {
  await page.route('https://appassets.androidplatform.net/static/js/main.*.js', (route) =>
    route.fulfill({ body: '', contentType: 'text/javascript' })
  )
  await page.reload()
  await expect(page.locator('#startup-title')).toHaveText('加载中')
  await expect(page.locator('#startup-logo svg')).toBeVisible()
  expect(await page.evaluate(() => window.AndroidTest.readyCalls)).toBe(0)
  expect(await page.evaluate(() => window.__deepseekStartupPhase)).toBe('兼容初始化完成')
  await page.screenshot({ path: 'test-results/android-loading.png' })
})

test('compatibility initialization errors are reported before app readiness', async ({ page }) => {
  await page.addInitScript(() => {
    window.matchMedia = () => {
      throw new Error('compatibility-init failure')
    }
  })
  await page.reload()
  await expect(page.locator('#startup-detail')).toContainText('compatibility-init failure')
  await expect
    .poll(() => page.evaluate(() => window.AndroidTest.startupErrors.length))
    .toBeGreaterThan(0)
  expect(await page.evaluate(() => window.AndroidTest.readyCalls)).toBe(0)
  expect(await page.evaluate(() => window.__deepseekStartupPhase)).toBe('启动脚本报告错误')
})

test('custom Base URL is verified with the saved key and persists for chat and uploads', async ({
  page,
}) => {
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue('https://api.deepseek.com')
  await page.getByLabel('Base URL', { exact: true }).fill('https://proxy.example:8443/service/v1/')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByLabel('Base URL', { exact: true })).toHaveValue(
    'https://proxy.example:8443/service/v1'
  )
  const verification = await page.evaluate(() => window.AndroidTest.requests.at(-1))
  expect(verification?.baseUrl).toBe('https://proxy.example:8443/service/v1')
  expect(verification?.headers.authorization).toBe('Bearer sk-android-test-only')
  await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
  await page.screenshot({ path: 'test-results/android-base-url.png' })
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:base-url'))).toBe(
    'https://proxy.example:8443/service/v1'
  )
  await expect(page.getByRole('dialog')).not.toBeVisible()
  await page.locator('input[type=file][multiple]').setInputFiles({
    name: 'test.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('custom server file'),
  })
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.AndroidTest.requests.some((request) => request.url.endsWith('/files'))
      )
    )
    .toBe(true)
  await page.locator('textarea').fill('使用自定义地址')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  const requests = await page.evaluate(() => window.AndroidTest.requests)
  expect(requests.length).toBeGreaterThanOrEqual(2)
  expect(
    requests.every((request) => request.baseUrl === 'https://proxy.example:8443/service/v1')
  ).toBe(true)
})

test('invalid URLs and failed verification retain the previous connection; default can be restored', async ({
  page,
}) => {
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  const requestCount = await page.evaluate(() => window.AndroidTest.requests.length)
  await page.getByLabel('Base URL', { exact: true }).fill('https://example.com?key=secret')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('有效的 HTTPS Base URL')
  expect(await page.evaluate(() => window.AndroidTest.requests.length)).toBe(requestCount)
  await page.getByLabel('Base URL', { exact: true }).fill('https://unavailable.example')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('API Key 无效')
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:base-url'))).toBe(
    'https://api.deepseek.com'
  )
  await page.getByLabel('Base URL', { exact: true }).fill('https://proxy.example/v1')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('chat-demo:base-url')))
    .toBe('https://proxy.example/v1')
  await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: '恢复 DeepSeek 默认地址', exact: true }).click()
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('chat-demo:base-url')))
    .toBe('https://api.deepseek.com')
  await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
})

test('fetches models with the draft connection and sends the selected model after reload', async ({
  page,
}) => {
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await page.getByLabel('Base URL', { exact: true }).fill('https://models.example/v1/')
  await page.getByRole('button', { name: '修改 API Key', exact: true }).click()
  await page.getByPlaceholder('请输入 API Key').fill('sk-model-catalog-test')
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已获取 3 个模型')
  const catalog = await page.evaluate(() => window.AndroidTest.requests.at(-1))
  expect(catalog?.baseUrl).toBe('https://models.example/v1')
  expect(catalog?.headers.authorization).toBe('Bearer sk-model-catalog-test')
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:base-url'))).toBe(
    'https://api.deepseek.com'
  )
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:api-key'))).toBe(
    'sk-android-test-only'
  )
  await expect(page.getByLabel('自定义模型 ID', { exact: true })).toHaveValue('deepseek-flash')
  await page.getByRole('button', { name: '选择模型', exact: true }).click()
  await page
    .getByRole('option', { name: 'Custom Chat (provider/custom-chat)', exact: true })
    .click()
  await expect(page.getByLabel('自定义模型 ID', { exact: true })).toHaveValue(
    'provider/custom-chat'
  )
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
  await page.getByLabel('自定义模型 ID', { exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/android-model-settings.png' })
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:model'))).toBe(
    'provider/custom-chat'
  )
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await expect(page.getByLabel('自定义模型 ID', { exact: true })).toHaveValue(
    'provider/custom-chat'
  )
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  await page.locator('textarea').fill('使用所选模型')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const chat = await page.evaluate(() =>
    window.AndroidTest.requests.find((request) => request.url.endsWith('/messages'))
  )
  expect(chat?.baseUrl).toBe('https://models.example/v1')
  expect(chat?.headers['x-api-key']).toBe('sk-model-catalog-test')
  expect(JSON.parse(Buffer.from(chat?.body || '', 'base64').toString()).model).toBe(
    'provider/custom-chat'
  )
})

test('custom model changes affect new replies and regeneration; continuation retains the original', async ({
  page,
}) => {
  const selectManual = async (model: string) => {
    await page.getByRole('button', { name: '打开边栏', exact: true }).click()
    await page.getByRole('button', { name: '设置', exact: true }).click()
    await page.getByRole('tab', { name: '数据管理' }).click()
    await page.getByLabel('自定义模型 ID', { exact: true }).fill(model)
    await page.getByRole('button', { name: '确定', exact: true }).click()
    await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  }
  await selectManual('provider/first-model:latest')
  await page.evaluate(() => {
    window.AndroidTest.stopReason = 'max_tokens'
  })
  await page.locator('textarea').fill('测试自定义模型续写')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByRole('button', { name: '继续生成', exact: true })).toBeVisible()
  await selectManual('provider/second-model')
  await page.evaluate(() => {
    window.AndroidTest.stopReason = 'end_turn'
  })
  await page.getByRole('button', { name: '继续生成', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.AndroidTest.requests.filter((request) => request.url.endsWith('/messages')).length
      )
    )
    .toBe(2)
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  await expect(page.getByRole('button', { name: '继续生成', exact: true })).not.toBeVisible()
  await page.getByRole('button', { name: '重新生成', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.AndroidTest.requests.filter((request) => request.url.endsWith('/messages')).length
      )
    )
    .toBe(3)
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  await page.locator('textarea').fill('再次发送')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.AndroidTest.requests.filter((request) => request.url.endsWith('/messages')).length
      )
    )
    .toBe(4)
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).not.toBeVisible()
  const chats = await page.evaluate(() =>
    window.AndroidTest.requests.filter((request) => request.url.endsWith('/messages'))
  )
  expect(
    chats.map((request) => JSON.parse(Buffer.from(request.body, 'base64').toString()).model)
  ).toEqual([
    'provider/first-model:latest',
    'provider/first-model:latest',
    'provider/second-model',
    'provider/second-model',
  ])
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:model'))).toBe(
    'provider/second-model'
  )
})

test('empty, failed and malformed catalogs permit retry and preserve manual model selection', async ({
  page,
}) => {
  await page.getByRole('button', { name: '打开边栏', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('tab', { name: '数据管理' }).click()
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已获取 3 个模型')
  await page.getByLabel('自定义模型 ID', { exact: true }).fill('provider/unlisted')
  await page.evaluate(() => {
    window.AndroidTest.modelStatus = 503
    window.AndroidTest.modelResponse = { error: { message: 'Catalog unavailable' } }
  })
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Catalog unavailable')
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toBeVisible()
  const requestCount = await page.evaluate(() => window.AndroidTest.requests.length)
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('button', { name: '确定', exact: true })).not.toBeVisible()
  expect(await page.evaluate(() => window.AndroidTest.requests.length)).toBe(requestCount)
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:model'))).toBe(
    'provider/unlisted'
  )
  await page.evaluate(() => {
    window.AndroidTest.modelStatus = 200
    window.AndroidTest.modelResponse = { data: [] }
  })
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('服务未返回可选模型')
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).not.toBeVisible()
  await page.evaluate(() => {
    window.AndroidTest.modelResponse = { unexpected: [] }
  })
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('模型列表格式不正确')
  await expect(page.getByLabel('自定义模型 ID', { exact: true })).toHaveValue('provider/unlisted')
  await page.getByLabel('自定义模型 ID', { exact: true }).fill('bad model')
  await page.getByRole('button', { name: '确定', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: '有效的模型 ID' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:model'))).toBe(
    'provider/unlisted'
  )
  await page.getByLabel('自定义模型 ID', { exact: true }).fill('provider/unlisted')
  await page.evaluate(() => {
    window.AndroidTest.modelResponse = { data: [{ id: 'retry-model' }] }
  })
  await page.getByRole('button', { name: '获取模型', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已获取 1 个模型')
  await expect(page.getByRole('alert')).not.toBeVisible()
  await expect(page.getByLabel('自定义模型 ID', { exact: true })).toHaveValue('provider/unlisted')
})

const openChatSidebar = async (page: Page) => {
  const opener = page.getByRole('button', { name: '打开边栏', exact: true })
  if (await opener.isVisible()) {
    await opener.click()
  }
}

const toggleAutoTitles = async (page: Page, enabled: boolean) => {
  await openChatSidebar(page)
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByLabel('AI 自动设置对话标题', { exact: true }).setChecked(enabled)
  await page.getByRole('button', { name: '关闭', exact: true }).click()
  const closer = page.getByRole('button', { name: '收起边栏', exact: true })
  if (await closer.isVisible()) {
    await closer.click()
  }
}

test('automatic titles use only the first message and snapshot the custom connection without delaying chat', async ({
  page,
}) => {
  await page.evaluate(() => {
    localStorage.setItem('chat-demo:api-key', 'sk-title-custom-test')
    localStorage.setItem('chat-demo:base-url', 'https://title-provider.example/v1')
    localStorage.setItem('chat-demo:model', 'provider/title-model')
  })
  await page.reload()
  await page.evaluate(() => {
    window.AndroidTest.titleDelay = 1600
  })
  await page.locator('textarea').fill('帮我规划上海三天旅行')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await openChatSidebar(page)
  await expect(page.locator('[data-session-id]').getByText('新对话', { exact: true })).toBeVisible()
  const titleRequests = await page.evaluate(() => window.AndroidTest.titleRequests)
  expect(titleRequests).toHaveLength(1)
  expect(titleRequests[0].baseUrl).toBe('https://title-provider.example/v1')
  expect(titleRequests[0].headers['x-api-key']).toBe('sk-title-custom-test')
  const titleBody = requestBody(titleRequests[0])
  expect(titleBody.model).toBe('provider/title-model')
  expect(titleBody.messages).toEqual([{ role: 'user', content: '帮我规划上海三天旅行' }])
  expect(titleBody.thinking).toBeUndefined()
  expect(titleBody.title).toBeUndefined()
  await expect(
    page.locator('[data-session-id]').getByText('安卓验证对话', { exact: true })
  ).toBeVisible()
  await page.getByRole('button', { name: '收起边栏', exact: true }).click()
  await page.locator('textarea').fill('第二条消息不应重新命名')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toHaveCount(2)
  expect(await page.evaluate(() => window.AndroidTest.titleRequests.length)).toBe(1)
  const chatBodies = (
    await page.evaluate(() =>
      window.AndroidTest.requests.filter((r) => r.url.endsWith('/messages'))
    )
  ).map(requestBody)
  expect(chatBodies.every((body) => body.title === undefined)).toBe(true)
  await page.reload()
  await openChatSidebar(page)
  await page.getByText('安卓验证对话', { exact: true }).click()
  await expect(page.getByText('第二条消息不应重新命名', { exact: true })).toBeVisible()
})

test('disabled automatic titles persist and ignore server title metadata', async ({ page }) => {
  await toggleAutoTitles(page, false)
  await page.reload()
  expect(await page.evaluate(() => localStorage.getItem('chat-demo:auto-title'))).toBe('false')
  await page.locator('textarea').fill('关闭自动标题的对话')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await openChatSidebar(page)
  await expect(page.locator('[data-session-id]').getByText('新对话', { exact: true })).toBeVisible()
  expect(await page.evaluate(() => window.AndroidTest.titleRequests)).toHaveLength(0)
})

for (const failure of ['http', 'empty', 'multiline']) {
  test(`automatic title ${failure} failures leave New chat and do not retry on later messages`, async ({
    page,
  }) => {
    await page.evaluate((failure) => {
      window.AndroidTest.titleStatus = failure === 'http' ? 503 : 200
      window.AndroidTest.titleText = failure === 'empty' ? '' : '标题\n错误的多行说明'
    }, failure)
    await page.locator('textarea').fill('标题请求失败也能继续聊天')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
    await openChatSidebar(page)
    await expect(
      page.locator('[data-session-id]').getByText('新对话', { exact: true })
    ).toBeVisible()
    await page.getByRole('button', { name: '收起边栏', exact: true }).click()
    await page.locator('textarea').fill('再次发送消息')
    await page.getByRole('button', { name: '发送', exact: true }).click()
    await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toHaveCount(2)
    expect(await page.evaluate(() => window.AndroidTest.titleRequests.length)).toBe(1)
  })
}

test('manual renaming cancels a pending automatic title and survives reload', async ({ page }) => {
  await page.evaluate(() => {
    window.AndroidTest.titleDelay = 2500
  })
  await page.locator('textarea').fill('标题晚返回的对话')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await openChatSidebar(page)
  await page.locator('[data-session-id]').getByRole('button', { name: '更多' }).click()
  await page.getByText('重命名', { exact: true }).click()
  const editor = page.getByRole('textbox', { name: '重命名', exact: true })
  await editor.fill('我自己设置的名称')
  await editor.press('Enter')
  await expect(
    page.locator('[data-session-id]').getByText('我自己设置的名称', { exact: true })
  ).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => window.AndroidTest.cancelled.length))
    .toBeGreaterThan(0)
  await page.reload()
  await openChatSidebar(page)
  await expect(
    page.locator('[data-session-id]').getByText('我自己设置的名称', { exact: true })
  ).toBeVisible()
})

test('turning automatic titles off cancels the pending request immediately', async ({ page }) => {
  await page.evaluate(() => {
    window.AndroidTest.titleDelay = 5000
  })
  await page.locator('textarea').fill('关闭开关之前发出的消息')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.AndroidTest.titleRequests.length)).toBe(1)
  await toggleAutoTitles(page, false)
  await expect
    .poll(() => page.evaluate(() => window.AndroidTest.cancelled.length))
    .toBeGreaterThan(0)
  await openChatSidebar(page)
  await expect(page.locator('[data-session-id]').getByText('新对话', { exact: true })).toBeVisible()
})

test('automatic titles of concurrent chats update the matching conversation', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 1000 })
  await page.evaluate(() => {
    window.AndroidTest.titleDelay = 1600
    window.AndroidTest.titleText = '第一个对话的标题'
  })
  await page.locator('textarea').fill('第一条消息属于第一个对话')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '开启新对话', exact: true }).click()
  await page.evaluate(() => {
    window.AndroidTest.titleText = '第二个对话的标题'
  })
  await page.locator('textarea').fill('第二个对话有独立的第一条消息')
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(
    page.locator('[data-session-id]').getByText('第一个对话的标题', { exact: true })
  ).toBeVisible()
  await expect(
    page.locator('[data-session-id]').getByText('第二个对话的标题', { exact: true })
  ).toBeVisible()
  await page.locator('[data-session-id]').getByText('第一个对话的标题', { exact: true }).click()
  await expect(page.getByText('第一条消息属于第一个对话', { exact: true })).toBeVisible()
})

test('an image-only first message can generate its title using inline multimodal content', async ({
  page,
}) => {
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
    'base64'
  )
  await page
    .locator('input[type=file][multiple]')
    .setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: image })
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '发送', exact: true }).click()
  await expect(page.getByText('安卓聊天验证成功。', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.AndroidTest.titleRequests.length)).toBe(1)
  const body = requestBody((await page.evaluate(() => window.AndroidTest.titleRequests))[0])
  expect(body.messages[0].content[1]).toEqual({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: image.toString('base64') },
  })
})

const chatSearchStatus = (page: Page) =>
  page.getByRole('status', { name: '搜索对话名称或内容', exact: true })

const seedSearchHistory = async (page: Page, count: number) => {
  await page.evaluate(async (count) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('chat-demo')
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    try {
      const tx = db.transaction(['sessions', 'sessionSummaries'], 'readwrite')
      for (let index = 0; index < count; index++) {
        const id = `search-seed-${index}`
        const session = {
          id,
          title: index === 0 ? '上海旅行计划' : `归档对话 ${index}`,
          createdAt: Date.now() - index,
          updatedAt: Date.now() - index,
          messages: [
            {
              id: id + '-u',
              role: 'user',
              content: (index === 1 ? '上海旅行预算两千元' : '普通用户消息') + '文字'.repeat(8000),
              files: [],
              createdAt: 1,
            },
            {
              id: id + '-a',
              role: 'assistant',
              model: null,
              status: 'done',
              prefix: true,
              blocks: [
                { type: 'text', text: index === 2 ? '请游览 the Bund，外滩夜景' : '普通助手回答' },
              ],
              createdAt: 2,
            },
            {
              id: id + '-branch',
              role: 'user',
              content: index === 3 ? '历史另一个版本：杭州西湖' : '消息分支',
              files: [],
              parentId: null,
              createdAt: 3,
            },
          ],
        }
        tx.objectStore('sessions').put(session)
        tx.objectStore('sessionSummaries').put({
          id,
          title: session.title,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          fileIds: [],
        })
      }
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  }, count)
  await page.reload()
}

for (const width of [390, 1024]) {
  test(`chat search at ${width}px reads history in two workers and supports messages, pagination and latest query`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    await seedSearchHistory(page, 600)
    const workerContexts: import('@playwright/test').Worker[] = []
    page.on('worker', (worker) => workerContexts.push(worker))
    await openChatSidebar(page)
    const search = page.getByRole('searchbox', { name: '搜索对话名称或内容' })
    await search.fill('上海')
    await expect(chatSearchStatus(page)).toHaveText('找到 2 个对话')
    expect(workerContexts).toHaveLength(2)
    expect(await workerContexts[0].evaluate(() => typeof document)).toBe('undefined')
    await expect(page.locator('[data-session-id]')).toHaveCount(2)
    await search.fill('归档对话')
    await expect(chatSearchStatus(page)).toHaveText('找到 599 个对话')
    await expect(page.locator('[data-session-id]')).toHaveCount(50)
    await page.getByRole('button', { name: '显示更多', exact: true }).click()
    await expect(page.locator('[data-session-id]')).toHaveCount(100)
    await search.fill('旧关键词不会保留')
    await search.fill('杭州西湖')
    await expect(chatSearchStatus(page)).toHaveText('找到 1 个对话')
    await expect(page.locator('[data-session-id]')).toHaveAttribute(
      'data-session-id',
      'search-seed-3'
    )
    await search.fill('BUND 夜景')
    await expect(chatSearchStatus(page)).toHaveText('找到 1 个对话')
    await expect(page.locator('[data-session-id]')).toHaveAttribute(
      'data-session-id',
      'search-seed-2'
    )
    await expect(page.locator('[data-session-id]')).toContainText('the Bund')
    await page.screenshot({ path: `test-results/chat-search-${width}.png` })
    await page.locator('[data-session-id]').click()
    await expect(
      page.locator('main').getByText('请游览 the Bund，外滩夜景', { exact: true })
    ).toBeVisible()
    expect(await page.evaluate(() => window.AndroidTest.requests.length)).toBe(0)
  })
}

test('chat search refreshes after renaming and deleting records and can retry a blocked worker', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 1000 })
  await seedSearchHistory(page, 4)
  let blockWorkers = true
  await page.route('**/chat-search*.js', async (route) => {
    if (blockWorkers) {
      await route.abort()
    } else {
      await route.fallback()
    }
  })
  const search = page.getByRole('searchbox', { name: '搜索对话名称或内容' })
  await search.fill('归档对话')
  await expect(chatSearchStatus(page)).toHaveText('搜索失败，请重试')
  blockWorkers = false
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await expect(chatSearchStatus(page)).toHaveText('找到 3 个对话')
  await page.locator('[data-session-id="search-seed-1"]').hover()
  await page
    .locator('[data-session-id="search-seed-1"]')
    .getByRole('button', { name: '更多' })
    .click()
  await page.getByText('重命名', { exact: true }).click()
  await page.getByRole('textbox', { name: '重命名', exact: true }).fill('独立名称')
  await page.getByRole('textbox', { name: '重命名', exact: true }).press('Enter')
  await expect(chatSearchStatus(page)).toHaveText('找到 2 个对话')
  await page.locator('[data-session-id="search-seed-2"]').hover()
  await page
    .locator('[data-session-id="search-seed-2"]')
    .getByRole('button', { name: '更多' })
    .click()
  await page.getByText('删除', { exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '删除', exact: true }).click()
  await expect(chatSearchStatus(page)).toHaveText('找到 1 个对话')
  await page.getByRole('button', { name: '清空对话搜索' }).click()
  await expect(page.locator('[data-session-id]')).toHaveCount(3)
})

test('large history search keeps the UI thread drawing frames during database reads and matching', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 1000 })
  await seedSearchHistory(page, 1200)
  await page.getByRole('searchbox', { name: '搜索对话名称或内容' }).fill('上海')
  const frames = await page.evaluate(async () => {
    const times: number[] = []
    const start = performance.now()
    while (performance.now() - start < 1200) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      times.push(performance.now())
    }
    return times
  })
  await expect(chatSearchStatus(page)).toHaveText('找到 2 个对话')
  expect(frames.length).toBeGreaterThan(20)
  expect(Math.max(...frames.slice(1).map((time, index) => time - frames[index]))).toBeLessThan(200)
})
