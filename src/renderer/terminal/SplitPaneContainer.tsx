import { useCallback, useRef } from 'react'
import type { SplitNode } from '../stores/splitPaneStore'
import { splitPaneStore } from '../stores/splitPaneStore'
import TerminalWidget from './TerminalWidget'
import '../styles/splitpane.css'

interface SplitPaneContainerProps {
  sessionId: string
  node: SplitNode
  focusedPaneId: string
  windowIsFocused: boolean
  onCharDims?: (dims: { width: number; height: number }) => void
  onSnapshot?: (getSnapshot: () => string[]) => void
}

function SplitPaneNode({
  sessionId,
  node,
  focusedPaneId,
  windowIsFocused,
  onCharDims,
  onSnapshot,
}: SplitPaneContainerProps): JSX.Element {
  const dividerRef = useRef<HTMLDivElement | null>(null)

  const handlePaneClick = useCallback(
    (paneId: string) => {
      splitPaneStore.getState().setFocusedPane(sessionId, paneId)
    },
    [sessionId]
  )

  if (node.type === 'leaf') {
    const isPaneFocused = windowIsFocused && focusedPaneId === node.paneId
    return (
      <div
        className={`split-pane-leaf${isPaneFocused ? ' split-pane-focused' : ''}`}
        onPointerDown={() => handlePaneClick(node.paneId)}
      >
        <TerminalWidget
          sessionId={node.paneId}
          isFocused={isPaneFocused}
          onCharDims={onCharDims}
          onSnapshot={onSnapshot}
        />
      </div>
    )
  }

  const isHorizontal = node.direction === 'horizontal'

  const handleDividerDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      const container = dividerRef.current?.parentElement
      if (!container) return

      const rect = container.getBoundingClientRect()

      const onMove = (moveEvent: PointerEvent): void => {
        const pos = isHorizontal
          ? (moveEvent.clientX - rect.left) / rect.width
          : (moveEvent.clientY - rect.top) / rect.height
        const clamped = Math.max(0.15, Math.min(0.85, pos))

        // Update CSS custom property for immediate visual feedback
        container.style.setProperty('--split-ratio', String(clamped))
      }

      const onUp = (): void => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)

        // Read final ratio from CSS property and commit to store
        const finalRatio = parseFloat(
          container.style.getPropertyValue('--split-ratio') || String(node.ratio)
        )

        // Update the tree in the store with the new ratio
        const tree = splitPaneStore.getState().getTree(sessionId)
        if (tree) {
          const updated = updateRatio(tree, node, finalRatio)
          const trees = new Map(splitPaneStore.getState().trees)
          trees.set(sessionId, updated)
          splitPaneStore.setState({ trees })
        }
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [isHorizontal, sessionId, node]
  )

  return (
    <div
      className={`split-pane-branch ${isHorizontal ? 'split-horizontal' : 'split-vertical'}`}
      style={{ '--split-ratio': node.ratio } as React.CSSProperties}
    >
      <div className="split-pane-child split-pane-first">
        <SplitPaneNode
          sessionId={sessionId}
          node={node.first}
          focusedPaneId={focusedPaneId}
          windowIsFocused={windowIsFocused}
          onCharDims={onCharDims}
          onSnapshot={onSnapshot}
        />
      </div>
      <div
        ref={dividerRef}
        className={`split-pane-divider ${isHorizontal ? 'split-divider-horizontal' : 'split-divider-vertical'}`}
        onPointerDown={handleDividerDrag}
      />
      <div className="split-pane-child split-pane-second">
        <SplitPaneNode
          sessionId={sessionId}
          node={node.second}
          focusedPaneId={focusedPaneId}
          windowIsFocused={windowIsFocused}
          onCharDims={onCharDims}
          onSnapshot={onSnapshot}
        />
      </div>
    </div>
  )
}

function updateRatio(
  tree: SplitNode,
  target: SplitNode,
  newRatio: number
): SplitNode {
  if (tree === target && tree.type === 'branch') {
    return { ...tree, ratio: newRatio }
  }
  if (tree.type === 'branch') {
    return {
      ...tree,
      first: updateRatio(tree.first, target, newRatio),
      second: updateRatio(tree.second, target, newRatio),
    }
  }
  return tree
}

export default function SplitPaneContainer({
  sessionId,
  node,
  focusedPaneId,
  windowIsFocused,
  onCharDims,
  onSnapshot,
}: SplitPaneContainerProps): JSX.Element {
  return (
    <SplitPaneNode
      sessionId={sessionId}
      node={node}
      focusedPaneId={focusedPaneId}
      windowIsFocused={windowIsFocused}
      onCharDims={onCharDims}
      onSnapshot={onSnapshot}
    />
  )
}
