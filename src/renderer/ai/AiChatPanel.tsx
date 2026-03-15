import { useCallback, useEffect, useRef, useState } from 'react'
import {
  agentStore,
  useAgents,
  useActiveAgentId,
  useActiveAgent,
} from '../stores/agentStore'
import { useGroupList } from '../stores/groupStore'
import { useAgentScopeSync } from './useAgentScopeSync'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import StopButton from './StopButton'
import { taskInputStore } from '../assembly/taskInputStore'
import '../styles/ai-chat.css'

export default function AiChatPanel(): JSX.Element {
  const agents = useAgents()
  const activeAgentId = useActiveAgentId()
  const activeAgent = useActiveAgent()
  const groups = useGroupList()
  const initializedRef = useRef(false)
  const [editingRole, setEditingRole] = useState(false)
  const [roleInput, setRoleInput] = useState('')

  // Sync group membership changes to main process
  useAgentScopeSync()

  // Create a default agent on first mount if none exist
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    if (agents.length === 0) {
      window.smokeAPI?.agent.create('Agent 1').then(({ agentId, color }) => {
        agentStore.getState().addAgent(agentId, 'Agent 1', color)
      })
    }
  }, [agents.length])

  const handleSend = useCallback(
    (text: string) => {
      if (!activeAgentId) return
      agentStore.getState().addUserMessage(activeAgentId, text)
      window.smokeAPI?.ai.send(activeAgentId, text)
    },
    [activeAgentId]
  )

  const handleStop = useCallback(() => {
    if (!activeAgentId) return
    window.smokeAPI?.ai.abort(activeAgentId)
    agentStore.getState().completeGeneration(activeAgentId)
  }, [activeAgentId])

  const handleClear = useCallback(() => {
    if (!activeAgentId) return
    window.smokeAPI?.ai.clear(activeAgentId)
    agentStore.getState().clearHistory(activeAgentId)
  }, [activeAgentId])

  const handleAddAgent = useCallback(() => {
    const name = `Agent ${agents.length + 1}`
    window.smokeAPI?.agent.create(name).then(({ agentId, color }) => {
      agentStore.getState().addAgent(agentId, name, color)
      agentStore.getState().setActiveAgent(agentId)
    })
  }, [agents.length])

  const handleRemoveAgent = useCallback(
    (agentId: string) => {
      window.smokeAPI?.agent.remove(agentId)
      agentStore.getState().removeAgent(agentId)
    },
    []
  )

  const handleSwitchAgent = useCallback((agentId: string) => {
    agentStore.getState().setActiveAgent(agentId)
  }, [])

  const handleAssignGroup = useCallback(
    (groupId: string) => {
      if (!activeAgentId) return
      const resolvedGroupId = groupId === '' ? null : groupId
      const group = resolvedGroupId ? groups.find((g) => g.id === resolvedGroupId) : null
      const memberIds = group?.memberIds ?? []
      agentStore.getState().assignGroup(activeAgentId, resolvedGroupId)
      window.smokeAPI?.agent.assignGroup(activeAgentId, resolvedGroupId, memberIds)
    },
    [activeAgentId, groups]
  )

  const handleSetRole = useCallback(
    (role: string) => {
      if (!activeAgentId) return
      const resolvedRole = role.trim() || null
      agentStore.getState().setRole(activeAgentId, resolvedRole)
      window.smokeAPI?.agent.setRole(activeAgentId, resolvedRole)
      setEditingRole(false)
    },
    [activeAgentId]
  )

  const messages = activeAgent?.messages ?? []
  const isGenerating = activeAgent?.isGenerating ?? false
  const error = activeAgent?.error ?? null

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-header">
        <span className="ai-chat-title">AI Agents</span>
        <div className="ai-chat-header-actions">
          <button
            className="ai-chat-assemble-btn"
            onClick={() => taskInputStore.getState().open()}
            title="Assemble Workspace"
          >
            Assemble
          </button>
          {messages.length > 0 && (
            <button className="ai-chat-clear-btn" onClick={handleClear}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Agent tab bar */}
      <div className="ai-agent-tabs">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`ai-agent-tab ${agent.id === activeAgentId ? 'active' : ''}`}
            onClick={() => handleSwitchAgent(agent.id)}
          >
            <span
              className="ai-agent-tab-color"
              style={{ background: agent.color }}
            />
            <span className="ai-agent-tab-name">{agent.name}</span>
            {agent.isGenerating && <span className="ai-agent-tab-indicator" />}
            {agents.length > 1 && (
              <button
                className="ai-agent-tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemoveAgent(agent.id)
                }}
              >
                x
              </button>
            )}
          </div>
        ))}
        <button className="ai-agent-tab-add" onClick={handleAddAgent}>
          +
        </button>
      </div>

      {/* Agent configuration bar: group + role */}
      {activeAgent && (
        <div className="ai-agent-config">
          <div className="ai-agent-config-row">
            <span
              className="ai-agent-color-swatch"
              style={{ background: activeAgent.color }}
            />
            <select
              className="ai-agent-group-select"
              value={activeAgent.assignedGroupId ?? ''}
              onChange={(e) => handleAssignGroup(e.target.value)}
            >
              <option value="">No group (all access)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="ai-agent-config-row">
            {editingRole ? (
              <input
                className="ai-agent-role-input"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onBlur={() => handleSetRole(roleInput)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSetRole(roleInput)
                  if (e.key === 'Escape') setEditingRole(false)
                }}
                placeholder="e.g. frontend, backend"
                autoFocus
              />
            ) : (
              <button
                className="ai-agent-role-btn"
                onClick={() => {
                  setRoleInput(activeAgent.role ?? '')
                  setEditingRole(true)
                }}
              >
                {activeAgent.role ? `Role: ${activeAgent.role}` : 'Set role...'}
              </button>
            )}
          </div>
        </div>
      )}

      <MessageList messages={messages} />
      {error && <div className="ai-error-banner">{error}</div>}
      {isGenerating ? (
        <div className="ai-chat-input-area">
          <StopButton onClick={handleStop} />
        </div>
      ) : (
        <ChatInput onSend={handleSend} disabled={isGenerating} />
      )}
    </div>
  )
}
