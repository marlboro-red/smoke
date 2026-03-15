/**
 * Manages multiple AiService instances (agents).
 *
 * Each agent has its own identity, conversation history, and abort controller.
 * Tools are registered on every new agent so each can independently
 * spawn terminals, read files, and manipulate the canvas.
 *
 * Agents can be assigned to canvas groups, restricting their scope to
 * only the sessions within that group. Each agent can also have a role
 * (e.g. "frontend", "backend") and a color for visual identification.
 */

import type { BrowserWindow } from 'electron'
import { AiService } from './AiService'
import type { PtyManager } from '../pty/PtyManager'
import { registerTools } from './tools'
import type { AgentScopeProvider } from './tools'

export const AGENT_COLORS = [
  '#61afef', '#e06c75', '#98c379', '#e5c07b', '#c678dd', '#56b6c2',
  '#d19a66', '#be5046', '#7ec699', '#a9b1d6',
]

export interface AgentMeta {
  groupId: string | null
  role: string | null
  color: string
  allowedSessionIds: Set<string> | null // null = unrestricted
}

export interface AgentInfo {
  id: string
  name: string
  groupId: string | null
  role: string | null
  color: string
}

export class AgentManager {
  private agents = new Map<string, AiService>()
  private agentMeta = new Map<string, AgentMeta>()
  private agentColorIndex = 0
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
    const color = AGENT_COLORS[this.agentColorIndex % AGENT_COLORS.length]
    this.agentColorIndex++

    const agent = new AiService(this.getMainWindow, undefined, name)
    const meta: AgentMeta = {
      groupId: null,
      role: null,
      color,
      allowedSessionIds: null,
    }
    this.agentMeta.set(agent.agentId, meta)

    if (this.ptyManager) {
      const scopeProvider: AgentScopeProvider = {
        agentId: agent.agentId,
        getAllowedSessionIds: () => this.agentMeta.get(agent.agentId)?.allowedSessionIds ?? null,
        getAssignedGroupId: () => this.agentMeta.get(agent.agentId)?.groupId ?? null,
        addSessionToScope: (sessionId: string) => {
          const m = this.agentMeta.get(agent.agentId)
          if (m?.allowedSessionIds) {
            m.allowedSessionIds.add(sessionId)
          }
        },
        getColor: () => this.agentMeta.get(agent.agentId)?.color ?? color,
      }
      registerTools(agent, this.ptyManager, this.getMainWindow, scopeProvider)
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
    this.agentMeta.delete(agentId)
    return true
  }

  /** Get an agent by ID. */
  getAgent(agentId: string): AiService | undefined {
    return this.agents.get(agentId)
  }

  /** Get agent metadata. */
  getAgentMeta(agentId: string): AgentMeta | undefined {
    return this.agentMeta.get(agentId)
  }

  /** Assign an agent to a group with initial scope. */
  assignGroup(agentId: string, groupId: string | null, memberSessionIds?: string[]): void {
    const meta = this.agentMeta.get(agentId)
    if (!meta) return
    meta.groupId = groupId
    if (groupId === null) {
      meta.allowedSessionIds = null
    } else {
      meta.allowedSessionIds = new Set(memberSessionIds ?? [])
    }
  }

  /** Set the agent's role. */
  setAgentRole(agentId: string, role: string | null): void {
    const meta = this.agentMeta.get(agentId)
    if (!meta) return
    meta.role = role
  }

  /** Update the scope (allowed session IDs) for an agent. */
  updateScope(agentId: string, sessionIds: string[]): void {
    const meta = this.agentMeta.get(agentId)
    if (!meta || meta.groupId === null) return
    meta.allowedSessionIds = new Set(sessionIds)
  }

  /** Get the agent's color. */
  getAgentColor(agentId: string): string {
    return this.agentMeta.get(agentId)?.color ?? AGENT_COLORS[0]
  }

  /** List all agents with metadata. */
  listAgents(): AgentInfo[] {
    const result: AgentInfo[] = []
    for (const agent of this.agents.values()) {
      const meta = this.agentMeta.get(agent.agentId)
      result.push({
        id: agent.agentId,
        name: agent.name,
        groupId: meta?.groupId ?? null,
        role: meta?.role ?? null,
        color: meta?.color ?? AGENT_COLORS[0],
      })
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
