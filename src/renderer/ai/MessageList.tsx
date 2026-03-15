import { useEffect, useRef } from 'react'
import type { ChatMessage, ToolUseBlock, ToolResultBlock, ContentBlock } from '../stores/aiStore'
import ToolCallCard from './ToolCallCard'

interface MessageListProps {
  messages: ChatMessage[]
}

function findToolResult(
  content: ContentBlock[],
  toolUseId: string
): ToolResultBlock | undefined {
  return content.find(
    (b): b is ToolResultBlock => b.type === 'tool_result' && b.tool_use_id === toolUseId
  )
}

function MessageBubble({ message }: { message: ChatMessage }): JSX.Element {
  return (
    <div className={`ai-message ${message.role}`}>
      <span className="ai-message-role">{message.role}</span>
      {message.content.map((block, i) => {
        if (block.type === 'text') {
          return block.text ? (
            <div key={i} className="ai-message-text">{block.text}</div>
          ) : null
        }
        if (block.type === 'tool_use') {
          const result = findToolResult(message.content, (block as ToolUseBlock).id)
          return (
            <ToolCallCard
              key={i}
              toolUse={block as ToolUseBlock}
              toolResult={result}
            />
          )
        }
        // tool_result blocks are rendered inside ToolCallCard, skip standalone
        return null
      })}
    </div>
  )
}

export default function MessageList({ messages }: MessageListProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="ai-message-list-empty">
        No messages yet. Start a conversation below.
      </div>
    )
  }

  return (
    <div className="ai-message-list">
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
