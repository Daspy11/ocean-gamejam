import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  // every worker runs a whole Phaser game at 60fps, so a machine's worth of them starve each other
  // and the tests that hold a key down time out. Three is as fast as ten here, and it never flakes.
  workers: 3,
  use: { baseURL: 'http://localhost:5173', headless: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
