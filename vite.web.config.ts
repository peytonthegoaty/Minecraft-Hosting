// Runs the renderer in a normal browser with a mocked backend (src/renderer/src/mock.ts).
// Used for UI work and screenshots without Electron: `npm run web`.
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: 'src/renderer',
  resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
  plugins: [react()],
    css: { postcss: resolve('.') },
  server: { port: 5199 }
})
