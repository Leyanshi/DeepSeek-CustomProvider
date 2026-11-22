import { defineConfig } from '@playwright/test'

// Android bridge tests use the existing system browser; no emulator download.

// eslint-disable-next-line import/no-default-export
export default defineConfig({
  testDir: './tests',
  testMatch: '**/android.e2e.ts',
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  use: {
    channel: 'msedge',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
  },
})
