import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'make preview',
    url: 'http://127.0.0.1:4321',
    reuseExistingServer: !process.env.CI,
  },
});
