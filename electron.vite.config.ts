import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared') } },
    build: { externalizeDeps: true }
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react()],
    css: { postcss: resolve('.') },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
