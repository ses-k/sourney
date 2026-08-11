import type { DownloadStatus } from '../../shared/types'

export type AddButtonState =
  | { kind: 'idle' }
  | { kind: 'queued' }
  | { kind: 'downloading'; progress: number }
  | { kind: 'done'; playing?: boolean }
  | { kind: 'failed' }

interface DownloadAddButtonProps {
  state: AddButtonState
  disabled?: boolean
  onClick: () => void
}

export function DownloadAddButton({ state, disabled, onClick }: DownloadAddButtonProps) {
  const busy = state.kind === 'queued' || state.kind === 'downloading'
  const playing = state.kind === 'done' && Boolean(state.playing)
  const label =
    state.kind === 'done'
      ? playing
        ? 'Pause'
        : 'Play'
      : state.kind === 'failed'
        ? 'Retry download'
        : state.kind === 'queued'
          ? 'Queued'
          : state.kind === 'downloading'
            ? `Downloading ${Math.round(state.progress)}%`
            : 'Download'

  return (
    <button
      type="button"
      className={`btn-track-play btn-search-action ${playing ? 'is-playing' : ''} ${
        state.kind === 'failed' ? 'is-failed' : ''
      } ${busy ? 'is-busy' : ''}`}
      disabled={disabled || busy}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      aria-label={label}
      title={label}
    >
      {state.kind === 'downloading' || state.kind === 'queued' ? (
        <ProgressRing progress={state.kind === 'downloading' ? state.progress : 8} />
      ) : state.kind === 'done' ? (
        playing ? <PauseIcon /> : <PlayIcon />
      ) : state.kind === 'failed' ? (
        <PlusIcon />
      ) : (
        <PlusIcon />
      )}
    </button>
  )
}

export function addStateFromDownload(
  status: DownloadStatus | undefined,
  progress: number,
): AddButtonState | null {
  if (!status) return null
  if (status === 'completed') return { kind: 'done' }
  if (status === 'pending') return { kind: 'queued' }
  if (status === 'downloading') return { kind: 'downloading', progress }
  if (status === 'failed' || status === 'cancelled') return { kind: 'failed' }
  return null
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 9
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, progress))
  const offset = circumference - (clamped / 100) * circumference

  return (
    <svg className="download-ring" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="download-ring-track" cx="12" cy="12" r={radius} />
      <circle
        className="download-ring-progress"
        cx="12"
        cy="12"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M11 5a1 1 0 1 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6V5z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28a1 1 0 0 0-1.5.86z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M7 5h3.5a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm6.5 0H17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-3.5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
    </svg>
  )
}
