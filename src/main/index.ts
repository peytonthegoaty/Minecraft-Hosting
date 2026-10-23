import path from 'node:path'
import { app, BrowserWindow, dialog, nativeTheme, shell } from 'electron'
import type { ApiEvents } from '@shared/api'
import { buildHandlers, defaultServersDir, registerIpc } from './ipc'
import { createServices, type Services } from './services'

const isDev = !app.isPackaged

// Same data folder whether packaged or run from source; BLOCKHOST_DATA_DIR allows a portable/test location.
app.setName('Blockhost')
app.setPath('userData', process.env['BLOCKHOST_DATA_DIR'] || path.join(app.getPath('appData'), 'Blockhost'))
let win: BrowserWindow | null = null
let services: Services | null = null
let quitting = false

const TITLEBAR = { dark: { color: '#14181C', symbolColor: '#E7EBEF' }, light: { color: '#FFFFFF', symbolColor: '#11161B' } }

function effectiveTheme(): 'dark' | 'light' {
  const pref = services?.settings.get().theme ?? 'system'
  if (pref === 'system') return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
  return pref
}

function applyTheme(): void {
  const pref = services?.settings.get().theme ?? 'system'
  nativeTheme.themeSource = pref
  const t = TITLEBAR[effectiveTheme()]
  if (win && process.platform === 'win32') win.setTitleBarOverlay({ ...t, height: 40 })
  win?.setBackgroundColor(t.color)
}

function emit<K extends keyof ApiEvents>(event: K, payload: ApiEvents[K]): void {
  if (win && !win.isDestroyed()) win.webContents.send(`evt:${event}`, payload)
}

function createWindow(): void {
  const t = TITLEBAR[effectiveTheme()]
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 960,
    minHeight: 620,
    show: false,
    title: 'Blockhost',
    backgroundColor: t.color,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform === 'win32' ? { ...t, height: 40 } : undefined,
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  // Links open in the browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) e.preventDefault()
  })
  win.on('close', async (e) => {
    if (quitting || !services?.servers.anyRunning()) return
    e.preventDefault()
    const r = await dialog.showMessageBox(win!, {
      type: 'question',
      buttons: ['Stop servers and quit', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Servers are running',
      message: 'Some servers are still running.',
      detail: 'Blockhost will stop them safely (saving the world) before closing.'
    })
    if (r.response === 0) {
      quitting = true
      await shutdown()
      app.quit()
    }
  })
  if (isDev && process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

async function shutdown(): Promise<void> {
  if (!services) return
  await services.servers.stopAll()
  await services.network.shutdown()
  services.scheduler.stop()
  services.servers.dispose()
}

async function checkForUpdates(): Promise<void> {
  if (isDev || !services?.settings.get().checkForUpdates) return
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = true
    autoUpdater.on('update-downloaded', (info) => emit('toast', { kind: 'info', message: `Blockhost ${info.version} is ready — it will install when you close the app.` }))
    await autoUpdater.checkForUpdates()
  } catch {
    // No release feed configured or offline.
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('gg.blockhost.app')
    services = await createServices(
      app.getPath('userData'),
      { theme: 'system', serversDir: defaultServersDir(), defaultMemoryMb: 4096, checkForUpdates: true },
      emit
    )
    registerIpc(buildHandlers(services, () => win, applyTheme))
    nativeTheme.themeSource = services.settings.get().theme
    nativeTheme.on('updated', applyTheme)
    createWindow()
    void checkForUpdates()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('before-quit', async (e) => {
    if (quitting || !services?.servers.anyRunning()) return
    e.preventDefault()
    quitting = true
    await shutdown()
    app.quit()
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
