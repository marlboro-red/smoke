interface StopButtonProps {
  onClick: () => void
}

export default function StopButton({ onClick }: StopButtonProps): JSX.Element {
  return (
    <button className="ai-stop-btn" onClick={onClick} title="Stop generating response">
      <span className="ai-stop-icon" />
      Stop generating
    </button>
  )
}
