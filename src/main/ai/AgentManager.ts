/**
 * Manages multiple ClaudeCodeManager instances (agents).
 *
 * Each agent has its own identity, conversation history, and Claude Code
 * subprocess. Tools are served via a shared MCP bridge that Claude Code
 * connects to through its MCP server configuration.
 *
 * Agents can be assigned to canvas groups, restricting their scope to
 * only the sessions within that group. Each agent can also have a role
 * (e.g. "frontend", "backend") and a color for visual identification.
 */

import type { BrowserWindow } from 'electron'
import { ClaudeCodeManager } from './ClaudeCodeManager'
import { McpBridge, type ToolExecutor } from './McpBridge'
import type { PtyManager } from '../pty/PtyManager'
import { createExecutors, type AgentScopeProvider, type CodegraphDeps } from './tools'

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
  private agents = new Map<string, ClaudeCodeManager>()
  private agentMeta = new Map<string, AgentMeta>()
  private agentColorIndex = 0
  private getMainWindow: () => BrowserWindow | null
  private ptyManager: PtyManager | null = null
  private codegraphDeps: CodegraphDeps | undefined
  private mcpBridge: McpBridge

  constructor(getMainWindow: () => BrowserWindow | null) {
    this.getMainWindow = getMainWindow
    this.mcpBridge = new McpBridge()
  }

  /** Set the PtyManager and start the MCP bridge with tool executors. */
  async setPtyManager(ptyManager: PtyManager): Promise<void> {
    this.ptyManager = ptyManager

    // Register global (unscoped) executors with the MCP bridge
    const executors = createExecutors(ptyManager, this.getMainWindow)
    this.mcpBridge.registerExecutors(executors)

    // Start the bridge HTTP server
    await this.mcpBridge.start()
  }

  /** Set codegraph dependencies so assemble_workspace is available to agents. */
  setCodegraphDeps(deps: CodegraphDeps): void {
    this.codegraphDeps = deps
  }

  /** Create a new agent with the given name. Returns the agent ID. */
  createAgent(name: string): string {
    const color = AGENT_COLORS[this.agentColorIndex % AGENT_COLORS.length]
    this.agentColorIndex++

    const agent = new ClaudeCodeManager(
      this.getMainWindow,
      this.mcpBridge,
      undefined,
      name
    )
    const meta: AgentMeta = {
      groupId: null,
      role: null,
      color,
      allowedSessionIds: null,
    }
    this.agentMeta.set(agent.agentId, meta)

    // If PtyManager is available, register scoped executors for this agent
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
      // The MCP bridge uses global executors; scope filtering happens
      // inside the executors themselves based on the agent context.
      void createExecutors(this.ptyManager, this.getMainWindow, scopeProvider, this.codegraphDeps)
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
  getAgent(agentId: string): ClaudeCodeManager | undefined {
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

  /** Stop the MCP bridge. */
  async shutdown(): Promise<void> {
    this.abortAll()
    await this.mcpBridge.stop()
  }
}
