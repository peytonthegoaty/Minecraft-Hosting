import { promises as fs } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ApiEvents } from '@shared/api'
import type { JavaRuntime, ServerConfig } from '@shared/types'
import { DownloadManager } from '../src/main/core/downloads/DownloadManager'
import { FileService } from '../src/main/core/files/FileService'
import type { JavaService } from '../src/main/core/java/JavaService'
import { AddonService } from '../src/main/core/plugins/AddonService'
import { BackupService } from '../src/main/core/servers/BackupService'
import { ServerManager } from '../src/main/core/servers/ServerManager'
import { makeJar, tmpDir, waitFor } from './helpers'

// A "java" that runs the fake Node server instead, so the whole lifecycle runs without Minecraft.
async function fakeJava(dir: string): Promise<string> {
  const script = path.resolve('test/fixtures/fake-server.mjs')
  const bin = path.join(dir, 'fakejava')
  await fs.writeFile(bin, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`, { mode: 0o755 })
  return bin
}

describe('server lifecycle', () => {
  let root: string
  let mgr: ServerManager
  let id: string
  const events: { event: keyof ApiEvents; payload: unknown }[] = []
  let java: JavaRuntime | null

  beforeAll(async () => {
    root = await tmpDir('bh-life-')
    java = { path: await fakeJava(root), major: 21, version: '21.0.5', vendor: 'Fake', arch: 'x64', managed: true }
    const javaService = {
      findFor: async () => java,
      list: async () => (java ? [java] : []),
      describeRequirement: (m: number) => `Java ${m}`
    } as unknown as JavaService
    const downloads = new DownloadManager(path.join(root, 'cache'), () => undefined)
    mgr = new ServerManager({
      dataDir: path.join(root, 'data'),
      serversDir: () => path.join(root, 'servers'),
      java: javaService,
      downloads,
      emit: (event, payload) => events.push({ event, payload })
    })
    // An existing server folder with a Crab Host config (import path), Paper type.
    const dir = path.join(root, 'servers', 'smp')
    await makeJar(path.join(dir, 'server.jar'), { 'version.json': JSON.stringify({ id: '1.21.4' }) })
    await fs.writeFile(path.join(dir, 'server.properties'), 'motd=Hello\nserver-port=25565\nmax-players=20\n')
    await makeJar(path.join(dir, 'plugins', 'Essentials.jar'), { 'plugin.yml': 'name: EssentialsX\nversion: 2.21.0\n' })
    const cfg: ServerConfig = {
      id: 'smp-test',
      name: 'Survival SMP',
      type: 'paper',
      mcVersion: '1.21.4',
      memoryMb: 1024,
      port: 25565,
      javaMajor: 21,
      javaPath: null,
      optimizedFlags: false,
      extraJvmArgs: '',
      autoRestart: true,
      createdAt: Date.now(),
      launch: { kind: 'jar', jar: 'server.jar' },
      backup: { enabled: false, intervalHours: 6, keep: 2 },
      restartSchedule: { enabled: false, time: '05:00' },
      network: { upnp: false, playit: false },
      rcon: { port: 25999, password: 'pw' }
    }
    await fs.writeFile(path.join(dir, 'crabhost.json'), JSON.stringify(cfg))
    const s = await mgr.importFolder(dir, 'ignored')
    id = s.id
  })

  afterAll(async () => {
    await mgr.stopAll(5000)
    mgr.dispose()
  })

  it('refuses to start before the EULA is accepted', async () => {
    await expect(mgr.start(id)).rejects.toThrow(/EULA/)
    await mgr.acceptEula(id)
    expect(await fs.readFile(path.join(mgr.dirOf(id), 'eula.txt'), 'utf8')).toMatch(/eula=true/)
  })

  it('starts, becomes running, and writes RCON settings', async () => {
    await mgr.start(id)
    await waitFor(() => mgr.list()[0].status === 'running')
    const props = await fs.readFile(path.join(mgr.dirOf(id), 'server.properties'), 'utf8')
    expect(props).toContain('enable-rcon=true')
    expect(props).toContain('rcon.port=25999')
    expect(props).toContain('motd=Hello')
    expect(mgr.getLog(id).some((l) => l.text.includes('Args: -Xmx1024M -Xms1024M -jar server.jar nogui'))).toBe(true)
  })

  it('runs console commands and tracks players', async () => {
    mgr.sendCommand(id, '/list')
    await waitFor(() => mgr.list()[0].players.length === 2)
    expect(mgr.list()[0].players).toEqual(['Alex_Builds', 'Creeper99'])
    mgr.sendCommand(id, 'join')
    await waitFor(() => mgr.list()[0].players.includes('Steve'))
    expect(mgr.getLog(id).some((l) => l.level === 'APP' && l.text === '> list')).toBe(true)
  })

  it('backs up while running using save-all', async () => {
    const backups = new BackupService(mgr)
    const b = await backups.create(id)
    expect(b.file).toMatch(/^backup-.*\.zip$/)
    expect(mgr.getLog(id).some((l) => l.text.includes('Saved the game'))).toBe(true)
    expect((await backups.list(id)).length).toBe(1)
  })

  it('restarts automatically after a crash', async () => {
    mgr.sendCommand(id, 'crash')
    await waitFor(() => mgr.list()[0].status === 'crashed')
    await waitFor(() => mgr.list()[0].status === 'running', 15000)
    expect(mgr.getLog(id).some((l) => l.text.includes('Restarting automatically'))).toBe(true)
  })

  it('stops cleanly', async () => {
    mgr.stop(id)
    await waitFor(() => mgr.list()[0].status === 'stopped')
    expect(mgr.list()[0].players).toEqual([])
    expect(events.some((e) => e.event === 'log')).toBe(true)
  })

  it('asks for Java when none matches', async () => {
    const saved = java
    java = null
    await expect(mgr.start(id)).rejects.toThrow(/JAVA_REQUIRED:21/)
    expect(events.some((e) => e.event === 'javaRequired' && (e.payload as { major: number }).major === 21)).toBe(true)
    java = saved
  })

  it('restores a backup over the world', async () => {
    const backups = new BackupService(mgr)
    await fs.writeFile(path.join(mgr.dirOf(id), 'server.properties'), 'motd=Changed\n')
    const [b] = await backups.list(id)
    await backups.restore(id, b.file)
    expect(await fs.readFile(path.join(mgr.dirOf(id), 'server.properties'), 'utf8')).toContain('enable-rcon=true')
  })

  it('edits files safely', async () => {
    const files = new FileService((x) => mgr.dirOf(x))
    await files.write(id, 'config/test.yml', 'a: 1\nb:\n  - x\n')
    await expect(files.write(id, 'config/test.yml', 'a: [1\n')).rejects.toThrow(/YAML error/)
    await expect(files.read(id, '../../etc/passwd')).rejects.toThrow(/outside/)
    const entries = await files.list(id, '')
    expect(entries[0].isDir).toBe(true)
    expect(entries.map((e) => e.name)).toContain('server.properties')
    await files.writeProperties(id, { 'max-players': '30' })
    expect((await files.readProperties(id))['max-players']).toBe('30')
  })

  it('lists and toggles plugins', async () => {
    const changed: string[] = []
    const addons = new AddonService((x) => mgr.dirOf(x), (x) => mgr.configOf(x), new DownloadManager(path.join(root, 'cache'), () => undefined), (x) => changed.push(x))
    const list = await addons.list(id)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'EssentialsX', version: '2.21.0', enabled: true })
    await addons.setEnabled(id, 'Essentials.jar', false)
    const after = await addons.list(id)
    expect(after[0]).toMatchObject({ file: 'Essentials.jar.disabled', enabled: false })
    expect(changed).toEqual([id])
  })
})
