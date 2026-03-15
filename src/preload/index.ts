import { contextBridge, ipcRenderer } from 'electron'
import type { SmokeAPI, PtyDataEvent, PtyExitEvent, AiStreamEvent, AiStreamCanvasAction, EventLogData } from './types'

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
    writefile: (path, content) => ipcRenderer.invoke('fs:writefile', { path, content }),
  },

  app: {
    getLaunchCwd: () => ipcRenderer.invoke('app:get-launch-cwd'),
  },

  recording: {
    flush: (log: EventLogData) => ipcRenderer.invoke('recording:flush', log),
  },

  ai: {
    send: (message, conversationId?) =>
      ipcRenderer.invoke('ai:send', { message, conversationId }),

    abort: (conversationId?) =>
      ipcRenderer.invoke('ai:abort', { conversationId }),

    clear: (conversationId?) =>
      ipcRenderer.invoke('ai:clear', { conversationId }),

    getConfig: () => ipcRenderer.invoke('ai:config'),

    setConfig: (key, value) =>
      ipcRenderer.invoke('ai:config', { key, value }),

    onStream: (callback: (event: AiStreamEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: AiStreamEvent): void => {
        callback(data)
      }
      ipcRenderer.on('ai:stream', listener)
      return () => {
        ipcRenderer.removeListener('ai:stream', listener)
      }
    },

    onCanvasAction: (callback: (event: AiStreamCanvasAction) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: AiStreamCanvasAction): void => {
        callback(data)
      }
      ipcRenderer.on('ai:canvas-action', listener)
      return () => {
        ipcRenderer.removeListener('ai:canvas-action', listener)
      }
    },
  }
}

contextBridge.exposeInMainWorld('smokeAPI', smokeAPI)
