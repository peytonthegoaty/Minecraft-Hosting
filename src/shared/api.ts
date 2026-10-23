// The typed contract between the renderer and the main process.
// Every method is exposed over IPC as `api:<name>`; every event as `evt:<name>`.

import type {
  AddonInfo,
  AddonSearchResult,
  AddonSource,
  AppSettings,
  BackupInfo,
  DownloadTask,
  FileContent,
  FileEntry,
  JavaRequirement,
  JavaRuntime,
  LogLine,
  Metrics,
  NetworkStatus,
  NewServerInput,
  ServerConfig,
  ServerStatus,
  ServerSummary,
  ServerType,
  SystemInfo,
  ToolInfo,
  VersionOption
} from './types'

export interface Api {
  // App
  getSettings(): AppSettings
  updateSettings(patch: Partial<AppSettings>): AppSettings
  getSystemInfo(): SystemInfo
  openExternal(url: string): void
  openPath(serverId: string, relPath?: string): void
  pickFolder(): string | null
  pickFiles(filters?: { name: string; extensions: string[] }[]): string[]

  // Servers
  listServers(): ServerSummary[]
  listVersions(type: ServerType, includeSnapshots: boolean): VersionOption[]
  listLoaderVersions(type: ServerType, mcVersion: string): VersionOption[]
  createServer(input: NewServerInput): ServerSummary
  importServer(dir: string, name: string): ServerSummary
  updateServer(id: string, patch: Partial<ServerConfig>): ServerSummary
  deleteServer(id: string, deleteFiles: boolean): void
  startServer(id: string): void
  stopServer(id: string): void
  restartServer(id: string): void
  killServer(id: string): void
  sendCommand(id: string, command: string): void
  getLog(id: string): LogLine[]
  getMetricsHistory(id: string): Metrics[]
  acceptEula(id: string): void

  // Java
  listJava(): JavaRuntime[]
  requiredJava(type: ServerType, mcVersion: string): number
  installJava(major: number): JavaRuntime
  removeJava(path: string): void
  addJavaManually(path: string): JavaRuntime

  // Files
  listDir(id: string, relPath: string): FileEntry[]
  readFile(id: string, relPath: string): FileContent
  writeFile(id: string, relPath: string, content: string): { mtime: number }
  createEntry(id: string, relPath: string, isDir: boolean): void
  renameEntry(id: string, from: string, to: string): void
  deleteEntry(id: string, relPath: string): void
  importFiles(id: string, relDir: string, sourcePaths: string[]): void
  zipEntries(id: string, relPaths: string[], target: string): void
  unzipEntry(id: string, relPath: string): void
  readProperties(id: string): Record<string, string>
  writeProperties(id: string, values: Record<string, string>): void

  // Plugins / mods
  listAddons(id: string): AddonInfo[]
  setAddonEnabled(id: string, file: string, enabled: boolean): void
  deleteAddon(id: string, file: string): void
  checkAddonUpdates(id: string): AddonInfo[]
  updateAddon(id: string, file: string): void
  searchAddons(id: string, source: AddonSource | 'all', query: string): AddonSearchResult[]
  installAddon(id: string, source: AddonSource, projectId: string): { installed: string[] }
  addAddonFiles(id: string, paths: string[]): void

  // Backups
  listBackups(id: string): BackupInfo[]
  createBackup(id: string): BackupInfo
  restoreBackup(id: string, file: string): void
  deleteBackup(id: string, file: string): void

  // Network
  getNetwork(id: string): NetworkStatus
  refreshNetwork(id: string): NetworkStatus
  setUpnp(id: string, enabled: boolean): NetworkStatus
  checkReachable(id: string): NetworkStatus
  allowFirewall(id: string): NetworkStatus
  setPlayit(id: string, enabled: boolean): NetworkStatus
  claimPlayit(): { url: string }
  setPlayitAddress(id: string, address: string): NetworkStatus
  unlinkPlayit(): void

  // Downloads & tools
  listDownloads(): DownloadTask[]
  listTools(): ToolInfo[]
  installTool(id: ToolInfo['id']): ToolInfo
  removeTool(id: ToolInfo['id']): void
  clearCache(): { freedBytes: number }
}

export interface ApiEvents {
  servers: ServerSummary[]
  status: { id: string; status: ServerStatus }
  log: { id: string; lines: LogLine[] }
  metrics: { id: string; metrics: Metrics }
  downloads: DownloadTask[]
  javaRequired: JavaRequirement
  network: NetworkStatus
  addons: { id: string }
  toast: { kind: 'info' | 'success' | 'error'; message: string }
}

export type ApiMethod = keyof Api

/** What the preload script exposes on `window.blockhost`. */
export interface Bridge {
  invoke<K extends ApiMethod>(method: K, ...args: Parameters<Api[K]>): Promise<Awaited<ReturnType<Api[K]>>>
  on<K extends keyof ApiEvents>(event: K, cb: (payload: ApiEvents[K]) => void): () => void
}

/** Errors thrown in the main process come back with this prefix so the UI can show a clean message. */
export const ERROR_PREFIX = 'BLOCKHOST:'
