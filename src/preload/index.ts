import { contextBridge } from 'electron'

export interface SmokeAPI {
  // Empty for now — will be populated by smoke-n5y (PTY Backend)
}

const smokeAPI: SmokeAPI = {}

contextBridge.exposeInMainWorld('smokeAPI', smokeAPI)
