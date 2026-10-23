// Types shared by the main process, preload and renderer.

export type ServerType = 'paper' | 'purpur' | 'vanilla' | 'fabric' | 'forge' | 'neoforge'

export const SERVER_TYPES: { id: ServerType; name: string; addons: 'plugins' | 'mods' | 'none'; description: string }[] = [
  { id: 'paper', name: 'Paper', addons: 'plugins', description: 'Fast, stable and runs Bukkit/Spigot plugins.' },
  { id: 'purpur', name: 'Purpur', addons: 'plugins', description: 'Paper plus extra gameplay settings.' },
  { id: 'vanilla', name: 'Vanilla', addons: 'none', description: 'The official Mojang server, untouched.' },
  { id: 'fabric', name: 'Fabric', addons: 'mods', description: 'Lightweight mods and performance mods.' },
  { id: 'forge', name: 'Forge', addons: 'mods', description: 'Classic big modpacks.' },
  { id: 'neoforge', name: 'NeoForge', addons: 'mods', description: 'Modern Forge-style modpacks for 1.20.2+.' }
]

export function addonKind(type: ServerType): 'plugins' | 'mods' | 'none' {
  return SERVER_TYPES.find((t) => t.id === type)?.addons ?? 'none'
}

export type ServerStatus = 'stopped' | 'installing' | 'starting' | 'running' | 'stopping' | 'crashed'

/** How the server is launched once installed. Paths are relative to the server folder. */
export type LaunchSpec =
  | { kind: 'jar'; jar: string }
  | { kind: 'argsfile'; winArgs: string; unixArgs: string }

export interface BackupSettings {
  enabled: boolean
  intervalHours: number
  keep: number
}

export interface RestartSchedule {
  enabled: boolean
  /** Local time, HH:MM */
  time: string
}

export interface ServerNetworkSettings {
  upnp: boolean
  playit: boolean
  /** Address shown for the playit tunnel; detected from the agent or entered by the user. */
  playitAddress?: string
}

export interface ServerConfig {
  id: string
  name: string
  type: ServerType
  mcVersion: string
  /** Paper/Purpur build, Fabric loader, Forge/NeoForge version. */
  loaderVersion?: string
  memoryMb: number
  port: number
  javaMajor: number
  /** A Java the user picked by hand; otherwise a matching runtime is chosen automatically. */
  javaPath?: string | null
  optimizedFlags: boolean
  extraJvmArgs: string
  autoRestart: boolean
  createdAt: number
  launch?: LaunchSpec
  backup: BackupSettings
  restartSchedule: RestartSchedule
  network: ServerNetworkSettings
  rcon: { port: number; password: string }
}

export interface ServerSummary extends ServerConfig {
  dir: string
  status: ServerStatus
  startedAt?: number
  players: string[]
  maxPlayers: number
  installed: boolean
  eulaAccepted: boolean
  installError?: string
}

export interface Metrics {
  ts: number
  cpu: number
  memBytes: number
  tps?: number
  mspt?: number
  players: number
  maxPlayers: number
}

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CHAT' | 'APP'

export interface LogLine {
  id: number
  t: number
  level: LogLevel
  text: string
}

export interface JavaRuntime {
  path: string
  major: number
  version: string
  vendor: string
  arch: string
  managed: boolean
}

export interface DownloadTask {
  id: string
  label: string
  received: number
  total: number
  status: 'active' | 'done' | 'error'
  error?: string
  bytesPerSec?: number
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  size: number
  mtime: number
}

export interface FileContent {
  path: string
  content: string
  binary: boolean
  tooLarge: boolean
  size: number
  mtime: number
}

export interface AddonInfo {
  file: string
  enabled: boolean
  name: string
  version: string
  authors: string[]
  description: string
  depends: string[]
  sha1: string
  size: number
  update?: { version: string; url: string; fileName: string }
}

export type AddonSource = 'modrinth' | 'hangar' | 'spigot'

export interface AddonSearchResult {
  source: AddonSource
  id: string
  name: string
  description: string
  downloads: number
  iconUrl?: string
  author: string
  pageUrl: string
}

export interface VersionOption {
  id: string
  label?: string
  stable: boolean
  latest?: boolean
}

export type UpnpState = 'off' | 'working' | 'open' | 'failed'
export type PlayitState = 'off' | 'notInstalled' | 'needsClaim' | 'claiming' | 'starting' | 'online' | 'error'

export interface NetworkStatus {
  serverId: string
  localIp: string | null
  otherIps: { name: string; address: string }[]
  port: number
  publicIp: string | null
  upnp: { state: UpnpState; error?: string; externalIp?: string }
  reachable: 'unknown' | 'checking' | 'yes' | 'no'
  playit: { state: PlayitState; address?: string; claimUrl?: string; error?: string; log?: string[] }
  firewall: 'unknown' | 'allowed' | 'missing' | 'n/a'
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface AppSettings {
  theme: ThemePref
  serversDir: string
  defaultMemoryMb: number
  checkForUpdates: boolean
  playitSecret?: string
}

export interface SystemInfo {
  platform: NodeJS.Platform | string
  arch: string
  totalMemBytes: number
  freeMemBytes: number
  cpus: number
  appVersion: string
  dataDir: string
}

export interface BackupInfo {
  file: string
  size: number
  createdAt: number
}

export interface NewServerInput {
  name: string
  type: ServerType
  mcVersion: string
  loaderVersion?: string
  memoryMb: number
  port?: number
  acceptEula: boolean
}

export interface JavaRequirement {
  serverId?: string
  major: number
  reason: string
  found: JavaRuntime[]
}

export interface ToolInfo {
  id: 'playit'
  name: string
  installed: boolean
  version?: string
  path?: string
}

export interface PropertiesFile {
  entries: { key: string; value: string }[]
}
