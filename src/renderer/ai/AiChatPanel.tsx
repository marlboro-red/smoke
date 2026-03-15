import { useCallback } from 'react'
import { aiStore, useAiMessages, useAiIsGenerating, useAiError } from '../stores/aiStore'
import MessageList from './MessageList'
import ChatInput from './ChatInput'
import StopButton from './StopButton'
import '../styles/ai-chat.css'

export default function AiChatPanel(): JSX.Element {
  const messages = useAiMessages()
  const isGenerating = useAiIsGenerating()
  const error = useAiError()

  const handleSend = useCallback((text: string) => {
    aiStore.getState().addUserMessage(text)
    window.smokeAPI?.ai.send(text)
  }, [])

  const handleStop = useCallback(() => {
    window.smokeAPI?.ai.abort()
    aiStore.getState().completeGeneration()
  }, [])

  const handleClear = useCallback(() => {
    window.smokeAPI?.ai.clear()
    aiStore.getState().clearHistory()
  }, [])

  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-header">
        <span className="ai-chat-title">AI Chat</span>
        {messages.length > 0 && (
          <button className="ai-chat-clear-btn" onClick={handleClear}>
            Clear
          </button>
        )}
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
