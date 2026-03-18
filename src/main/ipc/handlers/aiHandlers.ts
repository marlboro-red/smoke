import { ipcMain } from 'electron'
import { AgentManager } from '../../ai/AgentManager'
import { terminalOutputBuffer } from '../../ai/TerminalOutputBuffer'
import { aiLogger, type AiLogEntry, type AiLogCategory, type AiLogLevel } from '../../ai/AiLogger'
import type { AgentInfo } from '../../../preload/types'
import {
  AI_SEND,
  AI_ABORT,
  AI_CLEAR,
  AI_DIAGNOSTICS,
  AGENT_CREATE,
  AGENT_REMOVE,
  AGENT_LIST,
  AGENT_ASSIGN_GROUP,
  AGENT_SET_ROLE,
  AGENT_SET_MODEL,
  AGENT_UPDATE_SCOPE,
  TERMINAL_BUFFER_READ,
  TERMINAL_BUFFER_READ_LINES,
  type AiSendRequest,
  type AiSendResponse,
  type AiAbortRequest,
  type AiClearRequest,
  type AgentCreateRequest,
  type AgentCreateResponse,
  type AgentRemoveRequest,
  type AgentAssignGroupRequest,
  type AgentSetRoleRequest,
  type AgentSetModelRequest,
  type AgentUpdateScopeRequest,
  type TerminalBufferReadRequest,
  type TerminalBufferReadLinesRequest,
} from '../channels'

export function registerAiHandlers(
  agentManager: AgentManager,
): void {
  // Terminal output buffer handlers (AI orchestrator)
  ipcMain.handle(TERMINAL_BUFFER_READ, (_event, request: TerminalBufferReadRequest): string => {
    return terminalOutputBuffer.read(request.sessionId)
  })

  ipcMain.handle(TERMINAL_BUFFER_READ_LINES, (_event, request: TerminalBufferReadLinesRequest): string => {
    return terminalOutputBuffer.readLines(request.sessionId, request.lineCount)
  })

  // Agent management handlers
  ipcMain.handle(
    AGENT_CREATE,
    (_event, request: AgentCreateRequest): AgentCreateResponse => {
      const agentId = agentManager.createAgent(request.name)
      const color = agentManager.getAgentColor(agentId)
      return { agentId, color }
    }
  )

  ipcMain.handle(AGENT_REMOVE, (_event, request: AgentRemoveRequest): void => {
    agentManager.removeAgent(request.agentId)
  })

  ipcMain.handle(AGENT_LIST, (): AgentInfo[] => {
    return agentManager.listAgents()
  })

  ipcMain.handle(AGENT_ASSIGN_GROUP, (_event, request: AgentAssignGroupRequest): void => {
    agentManager.assignGroup(request.agentId, request.groupId, request.memberSessionIds)
  })

  ipcMain.handle(AGENT_SET_ROLE, (_event, request: AgentSetRoleRequest): void => {
    agentManager.setAgentRole(request.agentId, request.role)
  })

  ipcMain.handle(AGENT_SET_MODEL, (_event, request: AgentSetModelRequest): void => {
    agentManager.setAgentModel(request.agentId, request.model)
  })

  ipcMain.handle(AGENT_UPDATE_SCOPE, (_event, request: AgentUpdateScopeRequest): void => {
    agentManager.updateScope(request.agentId, request.sessionIds)
  })

  // AI handlers — route to the correct agent via agentId
  ipcMain.handle(
    AI_SEND,
    async (_event, request: AiSendRequest): Promise<AiSendResponse> => {
      aiLogger.info('ipc', `AI_SEND received`, {
        agentId: request.agentId,
        conversationId: request.conversationId ?? undefined,
        meta: { messageLength: request.message.length },
      })
      const sendStart = Date.now()
      const agent = agentManager.getAgent(request.agentId)
      if (!agent) {
        aiLogger.error('ipc', `AI_SEND: agent not found`, { agentId: request.agentId })
        return { conversationId: '', error: `Agent ${request.agentId} not found` }
      }
      try {
        const conversationId = await agent.sendMessage(
          request.message,
          request.conversationId
        )
        aiLogger.info('ipc', `AI_SEND completed`, {
          agentId: request.agentId,
          conversationId,
          meta: { durationMs: Date.now() - sendStart },
        })
        return { conversationId }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : 'AI request failed'
        aiLogger.error('ipc', `AI_SEND error: ${errorMsg}`, {
          agentId: request.agentId,
          meta: { durationMs: Date.now() - sendStart },
        })
        return { conversationId: request.conversationId ?? '', error: errorMsg }
      }
    }
  )

  ipcMain.handle(AI_ABORT, (_event, request: AiAbortRequest): void => {
    aiLogger.info('ipc', `AI_ABORT received`, {
      agentId: request.agentId,
      conversationId: request.conversationId ?? undefined,
    })
    const agent = agentManager.getAgent(request.agentId)
    agent?.abort(request.conversationId)
  })

  ipcMain.handle(AI_CLEAR, (_event, request: AiClearRequest): void => {
    aiLogger.info('ipc', `AI_CLEAR received`, {
      agentId: request.agentId,
      conversationId: request.conversationId ?? undefined,
    })
    const agent = agentManager.getAgent(request.agentId)
    agent?.clear(request.conversationId)
  })

  // AI diagnostics — return log entries to the renderer
  ipcMain.handle(
    AI_DIAGNOSTICS,
    (_event, filter?: {
      category?: AiLogCategory
      agentId?: string
      level?: AiLogLevel
      since?: number
      limit?: number
    }): AiLogEntry[] => {
      return aiLogger.getEntries(filter)
    }
  )
}
