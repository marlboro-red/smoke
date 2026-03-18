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

  // Register domain-specific IPC handlers and collect cleanup handles
  const ptyCleanup = registerPtyHandlers(ptyManager, getMainWindow)
  const configCleanup = registerConfigHandlers()
  const fsCleanup = registerFsHandlers(getMainWindow, launchCwd)
  const codegraphCleanup = registerCodegraphHandlers(getMainWindow)
  const { searchIndex, structureAnalyzer } = codegraphCleanup
  const aiCleanup = registerAiHandlers(agentManager)
  const recordingCleanup = registerRecordingHandlers(getMainWindow)
  const appCleanup = registerAppHandlers(getMainWindow, launchCwd, onMenuRebuild)
  const pluginCleanup = await registerPluginHandlers(getMainWindow, launchCwd)
  const { pluginLoader } = pluginCleanup

  // Wire cross-domain dependencies
  agentManager.setCodegraphDeps({ searchIndex, structureAnalyzer })
  agentManager.setPluginDeps({
    getPlugins: () => pluginLoader.getPlugins(),
    getPlugin: (name: string) => pluginLoader.getPlugin(name),
  })

  // Plugin IPC bridge handlers (sandboxed plugin API)
  const pluginIpcCleanup = registerPluginIpcHandlers(getMainWindow)

  return {
    dispose(): void {
      ptyCleanup.dispose()
      configCleanup.dispose()
      fsCleanup.dispose()
      codegraphCleanup.dispose()
      aiCleanup.dispose()
      recordingCleanup.dispose()
      appCleanup.dispose()
      pluginCleanup.dispose()
      pluginIpcCleanup.dispose()
    },
  }
}
