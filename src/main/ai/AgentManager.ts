/**
 * Manages multiple AiService instances (agents).
 *
 * Each agent has its own identity, conversation history, and abort controller.
 * Tools are registered on every new agent so each can independently
 * spawn terminals, read files, and manipulate the canvas.
 */

import type { BrowserWindow } from 'electron'
import { AiService } from './AiService'
import type { PtyManager } from '../pty/PtyManager'
import { registerTools } from './tools'

export interface AgentInfo {
  id: string
  name: string
}

export class AgentManager {
  private agents = new Map<string, AiService>()
  private getMainWindow: () => BrowserWindow | null
  private ptyManager: PtyManager | null = null

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow
  }

  /** Set the PtyManager so new agents get tools registered. */
  setPtyManager(ptyManager: PtyManager): void {
    this.ptyManager = ptyManager
  }

  /** Create a new agent with the given name. Returns the agent ID. */
  createAgent(name: string): string {
    const agent = new AiService(this.getMainWindow, undefined, name)
    if (this.ptyManager) {
      registerTools(agent, this.ptyManager, this.getMainWindow)
    }
    this.agents.set(agent.agentId, agent)
    return agent.agentId
  }

  /** Remove an agent and abort any in-flight work. */
  removeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId)
    if (!agent) return false
    agent.abort()
    this.agents.delete(agentId)
    return true
  }

  /** Get an agent by ID. */
  getAgent(agentId: string): AiService | undefined {
    return this.agents.get(agentId)
  }

  /** List all agents. */
  listAgents(): AgentInfo[] {
    const result: AgentInfo[] = []
    for (const agent of this.agents.values()) {
      result.push({ id: agent.agentId, name: agent.name })
    }
    return result
  }

  /** Abort all agents. */
  abortAll(): void {
    for (const agent of this.agents.values()) {
      agent.abort()
    }
  }
}
