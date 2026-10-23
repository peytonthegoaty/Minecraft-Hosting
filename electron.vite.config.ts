import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// Content-Security-Policy for the packaged app only (the dev server needs inline scripts for hot reload).
// file: is listed because the packaged renderer is loaded from disk.
const CSP = [
  "default-src 'self' file:",
  "script-src 'self' file:",
  "style-src 'self' file: 'unsafe-inline'",
  "img-src 'self' file: data: https:",
  "font-src 'self' file: data:",
  "worker-src 'self' file: blob:",
  "connect-src 'self' file:",
  "object-src 'none'",
  "base-uri 'none'"
].join('; ')

function cspPlugin(): Plugin {
  return {
    name: 'crabhost-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`)
  }
}

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
    plugins: [react(), cspPlugin()],
    css: { postcss: resolve('.') },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
