import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1, // Retry once — Electron process cleanup can cause flaky fixture timeouts
  workers: 1, // Electron tests must run serially
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
})
