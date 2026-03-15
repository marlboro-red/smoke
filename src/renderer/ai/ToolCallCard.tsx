import { useState } from 'react'
import type { ToolUseBlock, ToolResultBlock } from '../stores/aiStore'

interface ToolCallCardProps {
  toolUse: ToolUseBlock
  toolResult?: ToolResultBlock
}

export default function ToolCallCard({ toolUse, toolResult }: ToolCallCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false)

  const isError = toolResult?.is_error ?? false
  const status = toolResult ? (isError ? 'error' : 'success') : 'pending'

  return (
    <div className={`ai-tool-card${isError ? ' error' : ''}`}>
      <div className="ai-tool-card-header" onClick={() => setExpanded(!expanded)}>
        <span className={`ai-tool-card-arrow${expanded ? ' expanded' : ''}`}>&#9654;</span>
        <span className="ai-tool-card-name">{toolUse.name}</span>
        <span className={`ai-tool-card-status ${status}`} />
      </div>
      {expanded && (
        <div className="ai-tool-card-body">
          <span className="ai-tool-card-section-label">Parameters</span>
          <pre className="ai-tool-card-pre">
            {JSON.stringify(toolUse.input, null, 2)}
          </pre>
          {toolResult && (
            <>
              <span className="ai-tool-card-section-label">Result</span>
              <pre className={`ai-tool-card-pre${isError ? ' error-result' : ''}`}>
                {toolResult.content}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
