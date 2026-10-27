// @ts-check
const { defineConfig } = require('@playwright/test');

const exe = process.env.E2E_CHROMIUM_PATH; // optional: use an existing Chromium instead of `npx playwright install chromium`
const extraLd = process.env.E2E_LD_LIBRARY_PATH;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: 1, // tests share one real database; each test uses its own users/shows
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
    launchOptions: {
      ...(exe ? { executablePath: exe } : {}),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      ...(extraLd ? { env: { ...process.env, LD_LIBRARY_PATH: extraLd } } : {}),
    },
  },
});
