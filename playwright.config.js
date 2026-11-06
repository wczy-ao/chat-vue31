import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5197', headless: true },
  webServer: { command: 'npm run dev -- --port 5197', url: 'http://127.0.0.1:5197', reuseExistingServer: false }
})
