import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tutorials',
  timeout: 300_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://demo.localhost:5173',
    locale: 'es-ES',
    viewport: { width: 1280, height: 720 },
    video: {
      mode: 'on',
      size: { width: 1280, height: 720 },
    },
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  webServer: {
    command: 'pnpm run dev --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});

