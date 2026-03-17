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
import { addToast } from '../stores/toastStore'
import { withTimeout } from '../utils/withTimeout'
import '../styles/ai-chat.css'

/** Timeout for ai.send() — if the subprocess doesn't resolve in this time,
 *  force-complete generation so the UI doesn't get stuck forever. */
const AI_SEND_TIMEOUT_MS = 120_000

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
      }).catch((err) => {
        console.error('Failed to create default agent:', err)
        addToast('Failed to create AI agent', 'error')
      })
    }
  }, [agents.length])

  const handleSend = useCallback(
    (text: string) => {
      if (!activeAgentId) return
      const agentId = activeAgentId
      const store = agentStore.getState()
      store.addUserMessage(agentId, text)
      store.startGeneration(agentId)
      const existingConvId = store.agents.get(agentId)?.conversationId ?? undefined
      const sendPromise = window.smokeAPI?.ai.send(agentId, text, existingConvId)
      if (!sendPromise) return

      withTimeout(sendPromise, AI_SEND_TIMEOUT_MS)
        .then((response) => {
          if (response?.error) {
            console.error('AI send error:', response.error)
            agentStore.getState().setError(agentId, response.error)
          } else {
            // Store the conversationId so subsequent messages continue the
            // same conversation instead of spawning a fresh subprocess.
            if (response?.conversationId) {
              agentStore.getState().setConversationId(agentId, response.conversationId)
            }
            // Safety net: ensure generation completes even if stream events
            // (message_complete) were missed due to IPC timing or window state.
            // The IPC Promise resolves after the subprocess exits, so by this
            // point message_complete should have arrived — but if it didn't,
            // this prevents the UI from staying stuck on "Stop generating".
            agentStore.getState().completeGeneration(agentId)
          }
        })
        .catch((err) => {
          console.error('AI send failed:', err)
          const message =
            err instanceof Error && err.message.includes('timed out')
              ? 'AI response timed out — the subprocess may have hung'
              : 'Failed to send message'
          agentStore.getState().setError(agentId, message)
          // Also attempt to abort the hung subprocess
          window.smokeAPI?.ai.abort(agentId)
        })
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
    }).catch((err) => {
      console.error('Failed to create agent:', err)
      addToast('Failed to create AI agent', 'error')
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

  const handleSetModel = useCallback(
    (model: string) => {
      if (!activeAgentId) return
      const resolvedModel = model === '' ? null : model
      agentStore.getState().setModel(activeAgentId, resolvedModel)
      window.smokeAPI?.agent.setModel(activeAgentId, resolvedModel)
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
            <button className="ai-chat-clear-btn" onClick={handleClear} title="Clear chat history">
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
                title="Remove agent"
              >
                x
              </button>
            )}
          </div>
        ))}
        <button className="ai-agent-tab-add" onClick={handleAddAgent} title="Add new agent">
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
                title="Set agent role (e.g. frontend, backend)"
              >
                {activeAgent.role ? `Role: ${activeAgent.role}` : 'Set role...'}
              </button>
            )}
          </div>
          <div className="ai-agent-config-row">
            <select
              className="ai-agent-model-select"
              value={activeAgent.model ?? ''}
              onChange={(e) => handleSetModel(e.target.value)}
              title="Select AI model"
            >
              <option value="">Default model</option>
              <option value="claude-opus-4-6">Claude Opus</option>
              <option value="claude-sonnet-4-6">Claude Sonnet</option>
              <option value="claude-haiku-4-5-20251001">Claude Haiku</option>
            </select>
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
