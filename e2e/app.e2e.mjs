// End-to-end test of the real Electron app: seeds a server that runs e2e/FakeServer.java
// (a stand-in for Minecraft), then starts it, reads the console, checks live stats, and stops it.
// Needs a JDK (javac + jar) and a built app (`npm run build`). On Linux CI run under xvfb-run.
// Usage: node e2e/app.e2e.mjs [screenshotDir]
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shots = path.resolve(process.argv[2] ?? path.join(root, 'e2e', 'screenshots'))
mkdirSync(shots, { recursive: true })

const home = mkdtempSync(path.join(os.tmpdir(), 'crabhost-e2e-'))
const dataDir = path.join(home, 'data')
const serverDir = path.join(home, 'servers', 'e2e')
mkdirSync(dataDir, { recursive: true })
mkdirSync(serverDir, { recursive: true })

// Build the fake server jar.
const build = path.join(home, 'build')
mkdirSync(build)
execFileSync('javac', ['-d', build, path.join(root, 'e2e', 'FakeServer.java')], { stdio: 'inherit' })
writeFileSync(path.join(build, 'manifest.txt'), 'Main-Class: FakeServer\n')
execFileSync('jar', ['cfm', path.join(serverDir, 'server.jar'), 'manifest.txt', 'FakeServer.class'], { cwd: build, stdio: 'inherit' })

// `java -XshowSettings` prints to stderr.
const probe = spawnSync('java', ['-XshowSettings:properties', '-version'], { encoding: 'utf8' })
const javaMajor = parseInt(`${probe.stderr}${probe.stdout}`.match(/java\.version = (\d+)/)?.[1] ?? '21', 10)
writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true\n')
writeFileSync(path.join(serverDir, 'server.properties'), 'motd=E2E test\nmax-players=20\n')
writeFileSync(
  path.join(serverDir, 'crabhost.json'),
  JSON.stringify({
    id: 'e2e-test',
    name: 'E2E Server',
    type: 'paper',
    mcVersion: '1.21.4',
    memoryMb: 512,
    port: 25690,
    javaMajor: javaMajor >= 21 ? 21 : 17,
    javaPath: null,
    optimizedFlags: false,
    extraJvmArgs: '',
    autoRestart: false,
    createdAt: Date.now(),
    launch: { kind: 'jar', jar: 'server.jar' },
    backup: { enabled: false, intervalHours: 6, keep: 5 },
    restartSchedule: { enabled: false, time: '05:00' },
    network: { upnp: false, playit: false },
    rcon: { port: 25691, password: 'e2e-secret' }
  })
)
writeFileSync(path.join(dataDir, 'servers.json'), JSON.stringify([serverDir]))
writeFileSync(path.join(dataDir, 'settings.json'), JSON.stringify({ theme: 'dark', serversDir: path.join(home, 'servers'), checkForUpdates: false }))

const app = await electron.launch({
  args: [path.join(root, 'out', 'main', 'index.js'), '--no-sandbox'],
  env: { ...process.env, CRABHOST_DATA_DIR: dataDir, ELECTRON_ENABLE_LOGGING: '1' }
})
const mainLog = []
app.process().stdout?.on('data', (d) => mainLog.push(String(d)))
app.process().stderr?.on('data', (d) => mainLog.push(String(d)))
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && /Content Security Policy|Refused to/.test(m.text()) && errors.push(m.text()))
const step = async (name, fn) => {
  process.stdout.write(`• ${name}… `)
  await fn()
  await page.screenshot({ path: path.join(shots, `${name.replace(/\W+/g, '-').toLowerCase()}.png`) })
  console.log('ok')
}

try {
  await step('dashboard loads', async () => {
    await page.getByRole('heading', { name: 'E2E Server' }).waitFor()
  })
  await step('server starts', async () => {
    await page.getByRole('button', { name: 'Start server' }).click()
    await page.getByText('Running', { exact: false }).first().waitFor({ timeout: 30000 })
    await page.getByRole('button', { name: 'Stop server' }).waitFor()
  })
  await step('players come from RCON', async () => {
    await page.getByText('Alex_Builds').first().waitFor({ timeout: 20000 })
  })
  await step('live stats appear', async () => {
    await page.waitForFunction(() => /TPS\s*20\.0/.test(document.body.innerText), null, { timeout: 25000 })
    await page.waitForFunction(() => !/Memory\s*—/.test(document.body.innerText), null, { timeout: 15000 })
  })
  await step('console sends commands', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Console', exact: true }).click()
    await page.getByText('Done (0.512s)!').waitFor()
    await page.getByLabel('Server command').fill('say hello from e2e')
    await page.keyboard.press('Enter')
    await page.getByText('[Server] hello from e2e').waitFor()
  })
  await step('files show rcon settings', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Files', exact: true }).click()
    await page.getByRole('treeitem').filter({ hasText: 'server.properties' }).getByRole('button').first().click()
    await page.locator('.monaco-editor').waitFor({ timeout: 20000 })
    await page.waitForFunction(() => document.body.innerText.includes('enable-rcon'), null, { timeout: 10000 })
  })
  await step('server stops', async () => {
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Dashboard', exact: true }).click()
    await page.getByRole('button', { name: 'Stop server' }).click()
    await page.getByRole('button', { name: 'Start server' }).waitFor({ timeout: 30000 })
  })
  await step('light theme', async () => {
    await page.getByRole('group', { name: 'Theme' }).getByRole('button', { name: 'Light' }).click()
    await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
  })
  if (errors.length) throw new Error(`Page errors:\n${errors.join('\n')}`)
  console.log(`\nAll steps passed. Screenshots: ${shots}`)
} catch (e) {
  await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => undefined)
  console.error('\nFAILED — main process output:\n' + mainLog.join('').slice(-4000))
  if (errors.length) console.error('Page errors:\n' + errors.join('\n'))
  process.exitCode = 1
} finally {
  await app.close()
}
