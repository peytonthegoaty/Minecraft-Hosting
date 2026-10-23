import os from 'node:os'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { ERROR_PREFIX, type Api } from '@shared/api'
import { javaForMinecraft } from './core/servers/providers'
import { UserError } from './util/errors'
import { resolveInside } from './util/fsx'
import type { Services } from './services'

type Handlers = { [K in keyof Api]: (...args: Parameters<Api[K]>) => ReturnType<Api[K]> | Promise<ReturnType<Api[K]>> }

export function buildHandlers(s: Services, getWindow: () => BrowserWindow | null, onThemeChange: () => void): Handlers {
  return {
    getSettings: () => s.settings.get(),
    updateSettings: async (patch) => {
      const next = await s.settings.update(patch)
      if (patch.theme) onThemeChange()
      return next
    },
    getSystemInfo: () => ({
      platform: process.platform,
      arch: process.arch,
      totalMemBytes: os.totalmem(),
      freeMemBytes: os.freemem(),
      cpus: os.cpus().length,
      appVersion: app.getVersion(),
      dataDir: app.getPath('userData')
    }),
    openExternal: (url) => {
      if (!/^https?:\/\//i.test(url)) throw new UserError('Only web links can be opened.')
      void shell.openExternal(url)
    },
    openPath: (id, rel) => {
      void shell.openPath(rel ? resolveInside(s.servers.dirOf(id), rel) : s.servers.dirOf(id))
    },
    pickFolder: async () => {
      const win = getWindow()
      const r = win ? await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] }) : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      return r.canceled ? null : r.filePaths[0]
    },
    pickFiles: async (filters) => {
      const win = getWindow()
      const opts = { properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[], filters }
      const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      return r.canceled ? [] : r.filePaths
    },

    listServers: () => s.servers.list(),
    listVersions: (type, snaps) => s.servers.listVersions(type, snaps),
    listLoaderVersions: (type, mc) => s.servers.listLoaderVersions(type, mc),
    createServer: (input) => s.servers.create(input),
    importServer: (dir, name) => s.servers.importFolder(dir, name),
    updateServer: (id, patch) => s.servers.update(id, patch),
    deleteServer: (id, del) => s.servers.remove(id, del),
    startServer: (id) => s.servers.start(id),
    stopServer: (id) => s.servers.stop(id),
    restartServer: (id) => s.servers.restart(id),
    killServer: (id) => s.servers.kill(id),
    sendCommand: (id, cmd) => s.servers.sendCommand(id, cmd),
    getLog: (id) => s.servers.getLog(id),
    getMetricsHistory: (id) => s.servers.getMetrics(id),
    acceptEula: (id) => s.servers.acceptEula(id),

    listJava: () => s.java.list(true),
    requiredJava: (_type, mc) => javaForMinecraft(mc),
    installJava: (major) => s.java.install(major),
    removeJava: (p) => s.java.remove(p),
    addJavaManually: (p) => s.java.addManual(p),

    listDir: (id, rel) => s.files.list(id, rel),
    readFile: (id, rel) => s.files.read(id, rel),
    writeFile: (id, rel, content) => s.files.write(id, rel, content),
    createEntry: (id, rel, isDir) => s.files.create(id, rel, isDir),
    renameEntry: (id, from, to) => s.files.rename(id, from, to),
    deleteEntry: (id, rel) => s.files.remove(id, rel),
    importFiles: (id, relDir, paths) => s.files.importFiles(id, relDir, paths),
    zipEntries: (id, rels, target) => s.files.zip(id, rels, target),
    unzipEntry: (id, rel) => s.files.unzip(id, rel),
    readProperties: (id) => s.files.readProperties(id),
    writeProperties: (id, values) => s.files.writeProperties(id, values),

    listAddons: (id) => s.addons.list(id),
    setAddonEnabled: (id, file, enabled) => s.addons.setEnabled(id, file, enabled),
    deleteAddon: (id, file) => s.addons.remove(id, file),
    checkAddonUpdates: (id) => s.addons.checkUpdates(id),
    updateAddon: (id, file) => s.addons.update(id, file),
    searchAddons: (id, source, q) => s.addons.search(id, source, q),
    installAddon: (id, source, projectId) => s.addons.install(id, source, projectId),
    addAddonFiles: (id, paths) => s.addons.addFiles(id, paths),

    listBackups: (id) => s.backups.list(id),
    createBackup: (id) => s.backups.create(id),
    restoreBackup: (id, file) => s.backups.restore(id, file),
    deleteBackup: (id, file) => s.backups.remove(id, file),

    getNetwork: (id) => s.network.status(id),
    refreshNetwork: (id) => s.network.refresh(id),
    setUpnp: (id, on) => s.network.setUpnp(id, on),
    checkReachable: (id) => s.network.checkReachable(id),
    allowFirewall: (id) => s.network.allowFirewall(id),
    setPlayit: (id, on) => s.network.setPlayit(id, on),
    claimPlayit: () => s.network.claimPlayit(),
    setPlayitAddress: (id, addr) => s.network.setPlayitAddress(id, addr),
    unlinkPlayit: () => s.playit.unlink(),

    listDownloads: () => s.downloads.list(),
    listTools: async () => [await s.playit.info()],
    installTool: () => s.playit.install(),
    removeTool: () => s.playit.uninstall(),
    clearCache: async () => ({ freedBytes: await s.downloads.clearCache() })
  }
}

export function registerIpc(handlers: Handlers): void {
  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`api:${name}`, async (_e, ...args: unknown[]) => {
      try {
        return await (fn as (...a: unknown[]) => unknown)(...args)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (!(err instanceof UserError)) console.error(`[api:${name}]`, err)
        // Prefix lets the renderer strip Electron's "Error invoking remote method" wrapper.
        throw new Error(ERROR_PREFIX + msg)
      }
    })
  }
}

export function defaultServersDir(): string {
  return path.join(app.getPath('documents'), 'Crab Host Servers')
}
