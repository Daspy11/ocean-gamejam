import { defineConfig } from 'vitest/config'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `--mode single` (npm run build:mac) bakes the js, css and every png/json/ttf into one .html file,
// so a Mac can play it by double-clicking with no server, no Node and no Gatekeeper prompt.
export default defineConfig(({ mode }) => ({
  base: './', // itch.io serves the build from a subdirectory
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 }, // phaser alone is ~1.2 MB
  server: { port: 5173, strictPort: true },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}))
