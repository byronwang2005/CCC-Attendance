import { defineConfig } from '@playwright/test';
const chromium = {
  browserName: 'chromium' as const,
  channel: 'chromium',
  launchOptions: { args: process.platform === 'darwin' ? ['--use-angle=metal'] : [] }
};
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    screenshot: 'only-on-failure',
    video: 'on',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium-desktop', use: { ...chromium, viewport: { width: 1280, height: 900 } } },
    { name: 'webkit-desktop', use: { browserName: 'webkit', viewport: { width: 1280, height: 900 } } },
    {
      name: 'chromium-mobile',
      use: { ...chromium, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    },
    {
      name: 'webkit-mobile',
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    }
  ],
  webServer: {
    command: 'node scripts/browser-test-server.mjs',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI
  }
});
