import { useCallback, useEffect, useRef } from 'react'
import {
  agentStore,
  useAgents,
  useActiveAgentId,
  useActiveAgent,
} from '../stores/agentStore'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import StopButton from './StopButton'
import '../styles/ai-chat.css'

export default function AiChatPanel(): JSX.Element {
  const agents = useAgents()
  const activeAgentId = useActiveAgentId()
  const activeAgent = useActiveAgent()
  const initializedRef = useRef(false)

  // Create a default agent on first mount if none exist
  useEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true
    if (agents.length === 0) {
      window.smokeAPI?.agent.create('Agent 1').then(({ agentId }) => {
        agentStore.getState().addAgent(agentId, 'Agent 1')
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
    window.smokeAPI?.agent.create(name).then(({ agentId }) => {
      agentStore.getState().addAgent(agentId, name)
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

  const messages = activeAgent?.messages ?? []
  const isGenerating = activeAgent?.isGenerating ?? false
  const error = activeAgent?.error ?? null

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-header">
        <span className="ai-chat-title">AI Agents</span>
        {messages.length > 0 && (
          <button className="ai-chat-clear-btn" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      {/* Agent tab bar */}
      <div className="ai-agent-tabs">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`ai-agent-tab ${agent.id === activeAgentId ? 'active' : ''}`}
            onClick={() => handleSwitchAgent(agent.id)}
          >
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
