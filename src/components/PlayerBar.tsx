import { useEffect, useState } from 'react'
import type { Track } from '../../shared/types'
import { formatDuration } from '../lib/format'

interface PlayerBarProps {
  track: Track | null
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  onTogglePlay: () => void
  onStop: () => void
  onPrevious: () => void
  onNext: () => void
  onSeek: (time: number) => void
  onVolume: (volume: number) => void
}

export function PlayerBar({
  track,
  isPlaying,
  currentTime,
  duration,
  volume,
  onTogglePlay,
  onStop,
  onPrevious,
  onNext,
  onSeek,
  onVolume,
}: PlayerBarProps) {
  const total = duration || track?.duration || 0
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubTime, setScrubTime] = useState(0)
  const displayTime = scrubbing ? scrubTime : currentTime
  const progressPct = total > 0 ? Math.min(100, (displayTime / total) * 100) : 0

  useEffect(() => {
    if (!scrubbing) setScrubTime(currentTime)
  }, [currentTime, scrubbing])

  return (
    <footer className="z-20 grid h-[90px] grid-cols-[1fr_1.4fr_1fr] items-center gap-4 bg-[var(--player)] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-[#282828] shadow-lg">
          {track?.artworkUrl ? (
            <img src={track.artworkUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[#6a6a6a]">♪</div>
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">
            {track?.title ?? 'Nothing playing'}
          </div>
          <div className="truncate text-xs text-[#b3b3b3]">
            {track?.artist ?? 'Choose a song from your library'}
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <button className="btn-icon text-base" onClick={onPrevious} aria-label="Previous">
            ⏮
          </button>
          <button
            className="btn-play text-sm font-black"
            onClick={onTogglePlay}
            aria-label="Play pause"
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>
          <button className="btn-icon text-base" onClick={onNext} aria-label="Next">
            ⏭
          </button>
          <button className="btn-icon text-xs" onClick={onStop} aria-label="Stop">
            ■
          </button>
        </div>

        <div className="flex w-full max-w-xl items-center gap-2 text-[11px] text-[#b3b3b3]">
          <span className="w-10 text-right tabular-nums">{formatDuration(displayTime)}</span>
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-[7px] left-0 right-0 rounded-full bg-[#4d4d4d]" />
            <div
              className="pointer-events-none absolute inset-y-[7px] left-0 rounded-full bg-white"
              style={{ width: `${progressPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={total > 0 ? total : 0}
              step={0.1}
              value={total > 0 ? Math.min(displayTime, total) : 0}
              disabled={!track || total <= 0}
              onPointerDown={() => setScrubbing(true)}
              onPointerUp={(event) => {
                const next = Number((event.target as HTMLInputElement).value)
                setScrubbing(false)
                onSeek(next)
              }}
              onKeyUp={(event) => onSeek(Number((event.target as HTMLInputElement).value))}
              onChange={(event) => {
                const next = Number(event.target.value)
                setScrubTime(next)
                if (!scrubbing) onSeek(next)
              }}
              className="range relative z-10"
            />
          </div>
          <span className="w-10 tabular-nums">{formatDuration(total)}</span>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 text-xs text-[#b3b3b3]">
        <span>🔈</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(event) => onVolume(Number(event.target.value))}
          className="range w-28"
        />
      </div>
    </footer>
  )
}
