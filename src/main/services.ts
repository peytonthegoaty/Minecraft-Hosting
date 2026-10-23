// Creates and wires every backend service. Kept separate from Electron's app lifecycle.
import path from 'node:path'
import type { ApiEvents } from '@shared/api'
import type { AppSettings } from '@shared/types'
import { DownloadManager } from './core/downloads/DownloadManager'
import { FileService } from './core/files/FileService'
import { JavaService } from './core/java/JavaService'
import { NetworkService } from './core/network/NetworkService'
import { AddonService } from './core/plugins/AddonService'
import { BackupService } from './core/servers/BackupService'
import { Scheduler } from './core/servers/Scheduler'
import { ServerManager } from './core/servers/ServerManager'
import { PlayitService } from './core/tunnels/playit'
import { SettingsStore } from './settings'

export type Emit = <K extends keyof ApiEvents>(event: K, payload: ApiEvents[K]) => void

export async function createServices(dataDir: string, defaults: AppSettings, emit: Emit) {
  const settings = new SettingsStore(dataDir, defaults)
  await settings.load()
  const downloads = new DownloadManager(path.join(dataDir, 'cache'), (tasks) => emit('downloads', tasks))
  const java = new JavaService(path.join(dataDir, 'runtimes'), dataDir, downloads)
  const servers = new ServerManager({ dataDir, serversDir: () => settings.get().serversDir, java, downloads, emit })
  await servers.load()
  const files = new FileService((id) => servers.dirOf(id))
  const addons = new AddonService(
    (id) => servers.dirOf(id),
    (id) => servers.configOf(id),
    downloads,
    (id) => emit('addons', { id })
  )
  const backups = new BackupService(servers)
  const scheduler = new Scheduler(servers, backups)
  scheduler.start()
  let network: NetworkService | null = null
  const playit = new PlayitService(path.join(dataDir, 'tools'), downloads, () => network?.onPlayitChange())
  network = new NetworkService(servers, playit, (s) => emit('network', s))
  return { settings, downloads, java, servers, files, addons, backups, scheduler, playit, network }
}

export type Services = Awaited<ReturnType<typeof createServices>>
