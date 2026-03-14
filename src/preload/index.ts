import { contextBridge, ipcRenderer } from 'electron'
import type { SmokeAPI, PtyDataEvent, PtyExitEvent } from './types'

const smokeAPI: SmokeAPI = {
  pty: {
    spawn: (options) => ipcRenderer.invoke('pty:spawn', options),

    write: (id, data) => ipcRenderer.send('pty:data:to-pty', { id, data }),

    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', { id, cols, rows }),

    kill: (id) => ipcRenderer.send('pty:kill', { id }),

    onData: (callback: (event: PtyDataEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: PtyDataEvent): void => {
        callback(data)
      }
      ipcRenderer.on('pty:data:from-pty', listener)
      return () => {
        ipcRenderer.removeListener('pty:data:from-pty', listener)
      }
    },

    onExit: (callback: (event: PtyExitEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: PtyExitEvent): void => {
        callback(data)
      }
      ipcRenderer.on('pty:exit', listener)
      return () => {
        ipcRenderer.removeListener('pty:exit', listener)
      }
    }
  },

  layout: {
    save: (name, layout) => ipcRenderer.invoke('layout:save', { name, layout }),
    load: (name) => ipcRenderer.invoke('layout:load', { name }),
    list: () => ipcRenderer.invoke('layout:list'),
    delete: (name) => ipcRenderer.invoke('layout:delete', { name }),
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (key, value) => ipcRenderer.invoke('config:set', { key, value }),
  },

  fs: {
    readdir: (path) => ipcRenderer.invoke('fs:readdir', { path }),
    readfile: (path, maxSize?) => ipcRenderer.invoke('fs:readfile', { path, maxSize }),
  },

  app: {
    getLaunchCwd: () => ipcRenderer.invoke('app:get-launch-cwd'),
  }
}

contextBridge.exposeInMainWorld('smokeAPI', smokeAPI)
