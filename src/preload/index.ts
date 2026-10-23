import { contextBridge, ipcRenderer } from 'electron'
import type { Bridge } from '@shared/api'

const bridge: Bridge = {
  invoke: (method, ...args) => ipcRenderer.invoke(`api:${method}`, ...args),
  on: (event, cb) => {
    const listener = (_: Electron.IpcRendererEvent, payload: unknown) => cb(payload as never)
    ipcRenderer.on(`evt:${event}`, listener)
    return () => ipcRenderer.removeListener(`evt:${event}`, listener)
  }
}

contextBridge.exposeInMainWorld('blockhost', bridge)
contextBridge.exposeInMainWorld('platform', process.platform)
