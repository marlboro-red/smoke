import { type BrowserWindow } from 'electron'
import { PtyManager } from '../pty/PtyManager'
import { AgentManager } from '../ai/AgentManager'
import { registerPluginIpcHandlers } from '../plugin/pluginIpcHandlers'
import { registerPtyHandlers } from './handlers/ptyHandlers'
import { registerConfigHandlers } from './handlers/configHandlers'
import { registerFsHandlers } from './handlers/fsHandlers'
import { registerAiHandlers } from './handlers/aiHandlers'
import { registerCodegraphHandlers } from './handlers/codegraphHandlers'
import { registerRecordingHandlers } from './handlers/recordingHandlers'
import { registerAppHandlers } from './handlers/appHandlers'
import { registerPluginHandlers } from './handlers/pluginHandlers'

let agentManagerInstance: AgentManager | null = null

/** Get the shared AgentManager (available after registerIpcHandlers is called). */
export function getAgentManager(): AgentManager | null {
  return agentManagerInstance
}

export interface IpcCleanup {
  dispose: () => void
}

export async function registerIpcHandlers(
  ptyManager: PtyManager,
  getMainWindow: () => BrowserWindow | null,
  launchCwd: string,
  onMenuRebuild?: () => void
): Promise<IpcCleanup> {
  // Instantiate the agent manager for multi-agent support
  const agentManager = new AgentManager(getMainWindow)
  await agentManager.setPtyManager(ptyManager)
  agentManagerInstance = agentManager

  // Register domain-specific IPC handlers
  registerPtyHandlers(ptyManager, getMainWindow)
  registerConfigHandlers()
  const fsCleanup = registerFsHandlers(getMainWindow, launchCwd)
  const { searchIndex, structureAnalyzer } = registerCodegraphHandlers(getMainWindow)
  registerAiHandlers(agentManager)
  registerRecordingHandlers(getMainWindow)
  registerAppHandlers(getMainWindow, launchCwd, onMenuRebuild)
  const { pluginLoader } = await registerPluginHandlers(getMainWindow, launchCwd)

  // Wire cross-domain dependencies
  agentManager.setCodegraphDeps({ searchIndex, structureAnalyzer })
  agentManager.setPluginDeps({
    getPlugins: () => pluginLoader.getPlugins(),
    getPlugin: (name: string) => pluginLoader.getPlugin(name),
  })

  // Plugin IPC bridge handlers (sandboxed plugin API)
  registerPluginIpcHandlers(getMainWindow)

  return {
    dispose(): void {
      fsCleanup.dispose()
    },
  }
}
