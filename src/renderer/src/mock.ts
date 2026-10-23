// A fake backend so the UI can run in a normal browser (`npm run web`) for design work and screenshots.
// Never used inside the Electron app.
import type { Api, ApiEvents, Bridge } from '@shared/api'
import type { AddonInfo, LogLine, Metrics, NetworkStatus, ServerSummary } from '@shared/types'

type Listener = (p: unknown) => void

export function createMockBridge(): Bridge {
  const listeners = new Map<string, Set<Listener>>()
  const emit = <K extends keyof ApiEvents>(e: K, p: ApiEvents[K]) => listeners.get(e)?.forEach((l) => l(p))
  let seq = 1
  const now = Date.now()

  const base = {
    javaPath: null,
    optimizedFlags: true,
    extraJvmArgs: '',
    autoRestart: true,
    backup: { enabled: true, intervalHours: 6, keep: 10 },
    restartSchedule: { enabled: false, time: '05:00' },
    rcon: { port: 25575, password: 'x' },
    installed: true,
    eulaAccepted: true,
    launch: { kind: 'jar' as const, jar: 'server.jar' }
  }
  const servers: ServerSummary[] = [
    { ...base, id: 'survival', name: 'Survival SMP', type: 'paper', mcVersion: '1.21.4', loaderVersion: '232', memoryMb: 6144, port: 25565, javaMajor: 21, createdAt: now - 9e7, dir: 'C:\\Users\\you\\Documents\\Crab Host Servers\\survival-smp', status: 'running', startedAt: now - 8040000, players: ['Alex_Builds', 'Creeper99', 'SkyRunner', 'mossy_mae'], maxPlayers: 20, network: { upnp: true, playit: true, playitAddress: undefined } },
    { ...base, id: 'creative', name: 'Creative Build', type: 'fabric', mcVersion: '1.21.4', loaderVersion: '0.16.10', memoryMb: 4096, port: 25566, javaMajor: 21, createdAt: now - 5e7, dir: 'C:\\Users\\you\\Documents\\Crab Host Servers\\creative-build', status: 'stopped', players: [], maxPlayers: 10, network: { upnp: false, playit: false } },
    { ...base, id: 'modpack', name: 'Modpack Test', type: 'neoforge', mcVersion: '1.21.1', loaderVersion: '21.1.77', memoryMb: 8192, port: 25567, javaMajor: 21, createdAt: now - 1e7, dir: 'C:\\Users\\you\\Documents\\Crab Host Servers\\modpack-test', status: 'stopped', players: [], maxPlayers: 8, network: { upnp: false, playit: false } }
  ]

  const t0 = now - 600000
  const raw: [string, string][] = [
    ['INFO', 'Starting minecraft server version 1.21.4'],
    ['INFO', 'Loading properties'],
    ['INFO', 'Default game type: SURVIVAL'],
    ['INFO', '[EssentialsX] Enabling EssentialsX v2.21.0'],
    ['INFO', '[LuckPerms] Enabling LuckPerms v5.4.141'],
    ['WARN', '[Dynmap] Plugin built for 1.21.3 — may not be fully compatible'],
    ['INFO', 'Preparing spawn area: 100%'],
    ['INFO', 'Done (8.214s)! For help, type "help"'],
    ['INFO', 'Alex_Builds joined the game'],
    ['CHAT', '<Alex_Builds> anyone want to go to the nether?'],
    ['INFO', 'Creeper99 joined the game'],
    ['WARN', "Can't keep up! Is the server overloaded? Running 2104ms behind"],
    ['ERROR', '[ChestShop] Could not pass event BlockBreakEvent to ChestShop v3.12.2'],
    ['INFO', 'SkyRunner joined the game'],
    ['CHAT', '<SkyRunner> hi all'],
    ['INFO', 'mossy_mae joined the game'],
    ['APP', 'Backup saved: backup-2026-10-23_14-15-01.zip']
  ]
  const logs: Record<string, LogLine[]> = {
    survival: raw.map(([level, text], i) => ({ id: seq++, t: t0 + i * 30000, level: level as LogLine['level'], text: level === 'APP' ? text : `[14:${String(2 + i).padStart(2, '0')}:11 ${level === 'CHAT' ? 'INFO' : level}]: ${text}` })),
    creative: [{ id: seq++, t: now - 4e6, level: 'APP', text: 'Server stopped.' }],
    modpack: []
  }
  const metrics: Record<string, Metrics[]> = { survival: [], creative: [], modpack: [] }
  for (let i = 0; i < 120; i++) {
    metrics.survival.push({ ts: now - (120 - i) * 2000, cpu: 14 + 9 * Math.abs(Math.sin(i / 5)) + (i % 7), memBytes: (3.0 + 0.4 * (i / 120) + 0.05 * Math.sin(i / 3)) * 1024 ** 3, tps: 20, mspt: 11, players: 4, maxPlayers: 20 })
  }

  const net = (id: string): NetworkStatus => {
    const s = servers.find((x) => x.id === id)!
    return {
      serverId: id,
      localIp: '192.168.1.42',
      otherIps: [{ name: 'vEthernet (WSL)', address: '172.20.10.1' }],
      port: s.port,
      publicIp: '203.0.113.24',
      upnp: s.network.upnp ? { state: s.status === 'running' ? 'open' : 'off', externalIp: '203.0.113.24' } : { state: 'off' },
      reachable: s.network.upnp && s.status === 'running' ? 'yes' : 'unknown',
      playit: s.network.playit ? { state: 'online', address: 'survival-smp.joinmc.link', log: ['playit agent v0.15.26', 'tunnel running, 1 tunnels registered', 'survival-smp.joinmc.link => 127.0.0.1:25565 (minecraft-java)'] } : { state: 'off' },
      firewall: 'allowed'
    }
  }

  const addons: AddonInfo[] = [
    ['EssentialsX', '2.21.0', 'Homes, warps, kits and core commands', true],
    ['LuckPerms', '5.4.141', 'Permissions and player groups', true],
    ['WorldEdit', '7.3.9', 'In-game map editing tools', true],
    ['Dynmap', '3.7-beta-6', 'Live web map of your world', true],
    ['ChestShop', '3.12.2', 'Player-run chest shops', true],
    ['CoreProtect', '22.4', 'Block logging and rollback', false]
  ].map(([name, version, description, enabled], i) => ({
    file: `${name}.jar${enabled ? '' : '.disabled'}`,
    enabled: enabled as boolean,
    name: name as string,
    version: version as string,
    authors: [],
    description: description as string,
    depends: name === 'ChestShop' ? ['Vault'] : [],
    sha1: String(i),
    size: 400000 + i * 230000,
    update: name === 'LuckPerms' ? { version: '5.4.145', url: '', fileName: 'LuckPerms.jar' } : name === 'Dynmap' ? { version: '3.7-beta-8', url: '', fileName: 'Dynmap.jar' } : undefined
  }))

  const files: Record<string, { name: string; isDir: boolean; size: number }[]> = {
    '': [
      { name: 'backups', isDir: true, size: 0 },
      { name: 'config', isDir: true, size: 0 },
      { name: 'logs', isDir: true, size: 0 },
      { name: 'plugins', isDir: true, size: 0 },
      { name: 'world', isDir: true, size: 0 },
      { name: 'world_nether', isDir: true, size: 0 },
      { name: 'banned-players.json', isDir: false, size: 2 },
      { name: 'bukkit.yml', isDir: false, size: 1120 },
      { name: 'eula.txt', isDir: false, size: 158 },
      { name: 'ops.json', isDir: false, size: 112 },
      { name: 'server.jar', isDir: false, size: 51234567 },
      { name: 'server.properties', isDir: false, size: 1432 },
      { name: 'spigot.yml', isDir: false, size: 4980 },
      { name: 'whitelist.json', isDir: false, size: 230 }
    ],
    config: [
      { name: 'paper-global.yml', isDir: false, size: 6120 },
      { name: 'paper-world-defaults.yml', isDir: false, size: 9020 }
    ]
  }
  const contents: Record<string, string> = {
    'config/paper-global.yml': `# Paper global configuration\n_version: 29\nchunk-loading-basic:\n  autoconfig-send-distance: true\n  player-max-chunk-load-rate: 100.0\n  player-max-chunk-send-rate: 75.0\nchunk-system:\n  io-threads: -1\n  worker-threads: -1\nmessages:\n  no-permission: '<red>You can''t do that here.'\n  use-display-name-in-quit-message: false\nmisc:\n  max-joins-per-tick: five   # should be a number\n  region-file-cache-size: 256\n  use-alternative-luck-formula: false\nproxies:\n  velocity:\n    enabled: false\n    online-mode: true\nwatchdog:\n  early-warning-delay: 10000\n`,
    'server.properties': `#Minecraft server properties\nmotd=&6Welcome to Survival SMP! &7Season 3\nmax-players=20\ngamemode=survival\ndifficulty=normal\nwhite-list=true\nonline-mode=true\npvp=true\nview-distance=10\nsimulation-distance=8\nserver-port=25565\n`
  }

  // Live updates for the running server.
  setInterval(() => {
    const m = metrics.survival
    const last = m[m.length - 1]
    const next: Metrics = { ...last, ts: Date.now(), cpu: 12 + Math.random() * 16, memBytes: Math.min(5.6, last.memBytes / 1024 ** 3 + (Math.random() - 0.45) * 0.05) * 1024 ** 3 }
    m.push(next)
    if (m.length > 300) m.shift()
    emit('metrics', { id: 'survival', metrics: next })
  }, 2000)

  const props = () => Object.fromEntries(contents['server.properties'].split('\n').filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))

  const impl: Partial<{ [K in keyof Api]: (...a: Parameters<Api[K]>) => unknown }> = {
    getSettings: () => ({ theme: (localStorage.getItem('bh-theme') as 'system') ?? 'system', serversDir: 'C:\\Users\\you\\Documents\\Crab Host Servers', defaultMemoryMb: 4096, checkForUpdates: true }),
    updateSettings: (p) => {
      if (p.theme) localStorage.setItem('bh-theme', p.theme)
      return { ...(impl.getSettings!() as object), ...p }
    },
    getSystemInfo: () => ({ platform: 'win32', arch: 'x64', totalMemBytes: 16 * 1024 ** 3, freeMemBytes: 6.2 * 1024 ** 3, cpus: 12, appVersion: '0.1.0', dataDir: 'C:\\Users\\you\\AppData\\Roaming\\Crab Host' }),
    listServers: () => servers,
    listVersions: (type) =>
      (type === 'neoforge' ? ['1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.2'] : ['1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2', '1.16.5', '1.12.2']).map((id, i) => ({ id, stable: true, latest: i === 0 })),
    listLoaderVersions: (type) => (type === 'fabric' ? ['0.16.10', '0.16.9'] : type === 'forge' ? ['54.1.0', '54.0.26'] : type === 'neoforge' ? ['21.4.75-beta', '21.4.70-beta'] : []).map((id, i) => ({ id, stable: true, latest: i === 0 })),
    requiredJava: (_t, mc) => (mc.startsWith('1.16') || mc.startsWith('1.12') ? 8 : mc.startsWith('1.18') || mc.startsWith('1.19') || mc === '1.20.1' || mc === '1.20.4' ? 17 : 21),
    listJava: () => [
      { path: 'C:\\Users\\you\\AppData\\Roaming\\Crab Host\\runtimes\\java-21\\bin\\java.exe', major: 21, version: '21.0.5', vendor: 'Eclipse Adoptium', arch: 'amd64', managed: true },
      { path: 'C:\\Program Files\\Java\\jre1.8.0_421\\bin\\java.exe', major: 8, version: '1.8.0_421', vendor: 'Oracle Corporation', arch: 'amd64', managed: false }
    ],
    getLog: (id) => logs[id] ?? [],
    getMetricsHistory: (id) => metrics[id] ?? [],
    listDownloads: () => [],
    getNetwork: (id) => net(id),
    refreshNetwork: (id) => net(id),
    setUpnp: (id, on) => {
      servers.find((s) => s.id === id)!.network.upnp = on
      return net(id)
    },
    setPlayit: (id, on) => {
      servers.find((s) => s.id === id)!.network.playit = on
      return net(id)
    },
    checkReachable: (id) => net(id),
    listAddons: () => addons,
    checkAddonUpdates: () => addons,
    searchAddons: () =>
      [
        ['Chunky', 'modrinth', 2100000, 'Pre-generate chunks so exploring never lags.'],
        ['GriefPrevention', 'hangar', 890000, 'Players claim land with a golden shovel.'],
        ['Geyser', 'modrinth', 3400000, 'Let Bedrock players join your Java server.'],
        ['Vault', 'spigot', 7800000, 'Economy and permissions bridge for other plugins.'],
        ['Simple Voice Chat', 'modrinth', 5200000, 'Proximity voice chat for your server.'],
        ['ViaVersion', 'hangar', 4100000, 'Let newer clients join older servers.']
      ].map(([name, source, downloads, description]) => ({ source: source as 'modrinth', id: String(name), name: String(name), description: String(description), downloads: downloads as number, author: 'someone', pageUrl: 'https://modrinth.com' })),
    listDir: (_id, rel) => (files[rel] ?? []).map((f) => ({ ...f, path: rel ? `${rel}/${f.name}` : f.name, mtime: now })),
    readFile: (_id, rel) => ({ path: rel, content: contents[rel] ?? '', binary: rel.endsWith('.jar'), tooLarge: false, size: (contents[rel] ?? '').length, mtime: now }),
    writeFile: () => ({ mtime: Date.now() }),
    readProperties: () => props(),
    listBackups: () => [0, 1, 2].map((i) => ({ file: `backup-2026-10-23_${String(14 - i * 6).padStart(2, '0')}-15-01.zip`, size: 412e6 - i * 3e6, createdAt: now - 720000 - i * 6 * 3600000 })),
    listTools: () => [{ id: 'playit', name: 'playit.gg agent', installed: true, version: 'v0.15.26' }],
    pickFolder: () => null,
    pickFiles: () => [],
    claimPlayit: () => ({ url: 'https://playit.gg/claim/demo' }),
    clearCache: () => ({ freedBytes: 210e6 })
  }

  // Lets screenshot scripts trigger events such as the Java popup.
  ;(window as unknown as { __crabhostMock: unknown }).__crabhostMock = { emit }

  return {
    invoke: async (method, ...args) => {
      await new Promise((r) => setTimeout(r, 60))
      const fn = impl[method] as ((...a: unknown[]) => unknown) | undefined
      return (fn ? fn(...args) : undefined) as never
    },
    on: (event, cb) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(cb as Listener)
      return () => listeners.get(event)!.delete(cb as Listener)
    }
  }
}
