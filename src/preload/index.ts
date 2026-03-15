import { contextBridge, ipcRenderer } from 'electron'
import type { SmokeAPI, PtyDataEvent, PtyExitEvent, AiStreamEvent, AiStreamCanvasAction, EventLogData, Bookmark, ProjectIndexUpdatedEvent, CodeGraphImportEntry, TabState, SearchResponse, SearchBuildResult, SearchStats, SearchIndexProgressEvent, StructureMap, StructureModuleInfo, WorkspaceFileInput, WorkspaceLayoutResult, ParsedTask } from './types'

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

  bookmark: {
    save: (name, bookmark) => ipcRenderer.invoke('bookmark:save', { name, bookmark }),
    list: () => ipcRenderer.invoke('bookmark:list'),
    delete: (name) => ipcRenderer.invoke('bookmark:delete', { name }),
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (key, value) => ipcRenderer.invoke('config:set', { key, value }),
  },

  fs: {
    readdir: (path) => ipcRenderer.invoke('fs:readdir', { path }),
    readfile: (path, maxSize?) => ipcRenderer.invoke('fs:readfile', { path, maxSize }),
    readfileBase64: (path, maxSize?) => ipcRenderer.invoke('fs:readfile-base64', { path, maxSize }),
    writefile: (path, content) => ipcRenderer.invoke('fs:writefile', { path, content }),
    watch: (path) => ipcRenderer.invoke('fs:watch', { path }),
    unwatch: (path) => ipcRenderer.invoke('fs:unwatch', { path }),
    onFileChanged: (callback: (event: { path: string }) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { path: string }): void => {
        callback(data)
      }
      ipcRenderer.on('fs:file-changed', listener)
      return () => {
        ipcRenderer.removeListener('fs:file-changed', listener)
      }
    },
  },

  app: {
    getLaunchCwd: () => ipcRenderer.invoke('app:get-launch-cwd'),
  },

  recording: {
    flush: (log: EventLogData) => ipcRenderer.invoke('recording:flush', log),
    list: () => ipcRenderer.invoke('recording:list'),
    load: (filename: string) => ipcRenderer.invoke('recording:load', { filename }),
    exportRecording: (filename: string) => ipcRenderer.invoke('recording:export', { filename }),
    importRecording: () => ipcRenderer.invoke('recording:import'),
  },

  ai: {
    send: (agentId, message, conversationId?) =>
      ipcRenderer.invoke('ai:send', { agentId, message, conversationId }),

    abort: (agentId, conversationId?) =>
      ipcRenderer.invoke('ai:abort', { agentId, conversationId }),

    clear: (agentId, conversationId?) =>
      ipcRenderer.invoke('ai:clear', { agentId, conversationId }),

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
  },

  canvas: {
    exportPng: (rect) => ipcRenderer.invoke('canvas:export-png', rect),
  },

  project: {
    buildIndex: (rootPath) =>
      ipcRenderer.invoke('project:index-build', { rootPath }).then((r: { fileCount: number; basenameCount: number }) => r),
    lookup: (basename) =>
      ipcRenderer.invoke('project:index-lookup', { basename }).then((r: { paths: string[] }) => r.paths),
    getStats: () => ipcRenderer.invoke('project:index-stats'),
    onIndexUpdated: (callback: (event: ProjectIndexUpdatedEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: ProjectIndexUpdatedEvent): void => {
        callback(data)
      }
      ipcRenderer.on('project:index-updated', listener)
      return () => {
        ipcRenderer.removeListener('project:index-updated', listener)
      }
    },
  },

  tab: {
    getState: () => ipcRenderer.invoke('tab:get-state'),
    saveState: (state: TabState) => ipcRenderer.invoke('tab:save-state', state),
  },

  agent: {
    create: (name) => ipcRenderer.invoke('agent:create', { name }),
    remove: (agentId) => ipcRenderer.invoke('agent:remove', { agentId }),
    list: () => ipcRenderer.invoke('agent:list'),
    assignGroup: (agentId, groupId, memberSessionIds?) =>
      ipcRenderer.invoke('agent:assign-group', { agentId, groupId, memberSessionIds }),
    setRole: (agentId, role) =>
      ipcRenderer.invoke('agent:set-role', { agentId, role }),
    updateScope: (agentId, sessionIds) =>
      ipcRenderer.invoke('agent:update-scope', { agentId, sessionIds }),
  },

  task: {
    parse: (taskDescription, useAi?) =>
      ipcRenderer.invoke('task:parse', { taskDescription, useAi }),
  },

  relevance: {
    score: (taskDescription, candidateFiles, projectRoot, seedFiles?, limit?) =>
      ipcRenderer.invoke('relevance:score', {
        taskDescription, candidateFiles, projectRoot, seedFiles, limit,
      }),
  },

  codegraph: {
    build: (filePath, projectRoot, maxDepth?) =>
      ipcRenderer.invoke('codegraph:build', { filePath, projectRoot, maxDepth }),
    expand: (existingGraph, existingPositions, expandPath, projectRoot, maxDepth?) =>
      ipcRenderer.invoke('codegraph:expand', {
        existingGraph, existingPositions, expandPath, projectRoot, maxDepth,
      }),
    getImports: (filePath) =>
      ipcRenderer.invoke('codegraph:get-imports', { filePath })
        .then((r: { imports: CodeGraphImportEntry[] }) => r.imports),
    resolveImport: (specifier, importerPath, projectRoot) =>
      ipcRenderer.invoke('codegraph:resolve-import', { specifier, importerPath, projectRoot })
        .then((r: { resolvedPath: string | null }) => r.resolvedPath),
    indexStats: () => ipcRenderer.invoke('codegraph:index-stats'),
    invalidateIndex: () => ipcRenderer.invoke('codegraph:invalidate'),
    planWorkspace: (files: WorkspaceFileInput[]) =>
      ipcRenderer.invoke('codegraph:plan-workspace', { files })
        .then((r: WorkspaceLayoutResult) => r),
  },

  search: {
    build: (rootPath) =>
      ipcRenderer.invoke('search:build', { rootPath }),
    query: (query, maxResults?) =>
      ipcRenderer.invoke('search:query', { query, maxResults }),
    getStats: () => ipcRenderer.invoke('search:stats'),
    onProgress: (callback: (event: SearchIndexProgressEvent) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: SearchIndexProgressEvent): void => {
        callback(data)
      }
      ipcRenderer.on('search:index-progress', listener)
      return () => {
        ipcRenderer.removeListener('search:index-progress', listener)
      }
    },
  },

  structure: {
    analyze: (rootPath) =>
      ipcRenderer.invoke('structure:analyze', { rootPath }),
    get: () => ipcRenderer.invoke('structure:get'),
    getModule: (moduleId) =>
      ipcRenderer.invoke('structure:get-module', { moduleId }),
  },
}

contextBridge.exposeInMainWorld('smokeAPI', smokeAPI)
