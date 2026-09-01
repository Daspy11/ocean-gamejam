import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './', // itch.io serves the build from a subdirectory
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 }, // phaser alone is ~1.2 MB
  server: { port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
})
