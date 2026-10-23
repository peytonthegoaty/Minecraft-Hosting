// Launches a packaged build (path as argument) with a fresh data folder and checks the home screen renders.
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron } from 'playwright'

const exe = path.resolve(process.argv[2])
const data = mkdtempSync(path.join(os.tmpdir(), 'blockhost-smoke-'))
const app = await electron.launch({ executablePath: exe, args: ['--no-sandbox'], env: { ...process.env, BLOCKHOST_DATA_DIR: data, HOME: data } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.getByText('Create your first server').waitFor({ timeout: 30000 })
await page.getByText(/Java runtimes/).waitFor()
if (process.argv[3]) await page.screenshot({ path: process.argv[3] })
await app.close()
if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log('Packaged app started and rendered the home screen.')
