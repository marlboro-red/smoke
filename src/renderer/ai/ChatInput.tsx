import { useState, useCallback, useRef, useEffect } from 'react'

interface ChatInputProps {
  onSend: (text: string) => void
  disabled?: boolean
}

export default function ChatInput({ onSend, disabled }: ChatInputProps): JSX.Element {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea to fit content
  useEffect(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [text])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const trimmed = text.trim()
        if (trimmed && !disabled) {
          onSend(trimmed)
          setText('')
        }
      }
    },
    [text, disabled, onSend]
  )

  return (
    <div className="ai-chat-input-area">
      <textarea
        ref={textareaRef}
        className="ai-chat-input"
        placeholder="Ask the AI..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        rows={1}
      />
      <span className="ai-chat-input-hint">Enter to send, Shift+Enter for newline</span>
    </div>
  )
}
