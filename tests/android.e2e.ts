import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { unzipSync } from 'fflate'

const localPolicy = (
  await readFile('android/src/com/chatdemo/deepseek/android/MainActivity.java', 'utf8')
).match(/headers\.put\("Content-Security-Policy", "([^"]+)"\)/)?.[1]
if (!localPolicy) {
  throw new Error('Android content policy is missing')
}

type Harness = {
  requests: {
    url: string
    baseUrl: string
    method: string
    headers: Record<string, string>
    body: string
  }[]
  cancelled: string[]
  saved: { name: string; type: string; chunks: string[] }[]
  links: string[]
  dark: boolean
  modelResponse: unknown
  modelStatus: number
  stopReason: 'end_turn' | 'max_tokens'
}
declare global {
  interface Window {
    AndroidTest: Harness
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
      await route.fulfill({
        body: await readFile(filename),
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
      saved: [],
      links: [],
      dark: false,
      modelResponse: {
        data: [
          { id: 'deepseek-flash' },
          { id: 'deepseek-v4-pro' },
          { id: 'provider/custom-chat', display_name: 'Custom Chat' },
        ],
      },
      modelStatus: 200,
      stopReason: 'end_turn',
    }
    window.AndroidTest = harness
    const jobs = new Map<string, { name: string; type: string; chunks: string[] }>()
    const emit = (detail: Record<string, unknown>) =>
      window.dispatchEvent(new CustomEvent('deepseek-native', { detail }))
    const data = (id: string, text: string) =>
      emit({ id, type: 'data', data: btoa(String.fromCharCode(...new TextEncoder().encode(text))) })
    window.DeepSeekAndroid = {
      request(payload: string) {
        const request = JSON.parse(payload)
        harness.requests.push(request)
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
                  text: '安卓聊天验证成功。\n\n公式：$E=mc^2$\n\n[DeepSeek 官网](https://www.deepseek.com)',
                },
              },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: {
                  stop_reason: harness.stopReason,
                  stop_sequence: null,
                  title: '安卓验证对话',
                },
              },
              { type: 'message_stop' },
            ]
            events.forEach((event, index) =>
              setTimeout(() => {
                if (harness.cancelled.includes(id)) {
                  return
                }
                data(id, `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
                if (index === events.length - 1) {
                  emit({ id, type: 'end' })
                }
              }, index * 70)
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

test('Android mobile chat, binary upload, export, theme and browser links', async ({ page }) => {
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
  await expect.poll(() => page.evaluate(() => window.AndroidTest.cancelled.length)).toBe(1)
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
