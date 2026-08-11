import { useCallback, useEffect, useRef, useState } from 'react'
import type { Track } from '../shared/types'
import { getApi } from './api/client'
import { PlayerBar } from './components/PlayerBar'
import { usePlayer } from './hooks/usePlayer'
import { formatError } from './lib/format'
import { isPlayInterruptedError } from './lib/playback'
import { DownloadsScreen } from './screens/DownloadsScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { SearchScreen } from './screens/SearchScreen'
import { SettingsScreen } from './screens/SettingsScreen'

type Tab = 'search' | 'downloads' | 'library' | 'settings'

const TABS: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'search', label: 'Search', icon: '⌕' },
  { id: 'library', label: 'Your Library', icon: '▤' },
  { id: 'downloads', label: 'Downloads', icon: '↓' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('search')
  const [tracks, setTracks] = useState<Track[]>([])
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const apiReady = typeof window !== 'undefined' && Boolean(window.sourney)
  const autoplayUrlsRef = useRef(new Set<string>())

  const handlePlayerError = useCallback((err: unknown) => {
    if (isPlayInterruptedError(err)) return
    setPlayerError(formatError(err, 'Could not play track.'))
  }, [])

  const player = usePlayer(tracks, (message) => setPlayerError(message))

  const refreshLibrary = useCallback(async () => {
    try {
      const next = await getApi().getTracks()
      setTracks(next)
      setLibraryError(null)
      return next
    } catch (err) {
      setLibraryError(formatError(err, 'Could not load library.'))
      return [] as Track[]
    }
  }, [])

  const playTrack = useCallback(
    async (track: Track) => {
      try {
        setPlayerError(null)
        await player.playTrack(track)
      } catch (err) {
        handlePlayerError(err)
      }
    },
    [player, handlePlayerError],
  )

  const playBySourceUrl = useCallback(
    async (sourceUrl: string) => {
      const findTrack = async () => {
        const nextTracks = await refreshLibrary()
        return nextTracks.find((item) => item.sourceUrl === sourceUrl) ?? null
      }

      try {
        let track = await findTrack()
        if (!track) {
          await new Promise((resolve) => window.setTimeout(resolve, 300))
          track = await findTrack()
        }
        if (!track) {
          await new Promise((resolve) => window.setTimeout(resolve, 700))
          track = await findTrack()
        }
        if (!track) {
          setPlayerError('Track was not found in the library.')
          return
        }
        await playTrack(track)
      } catch (err) {
        handlePlayerError(err)
      }
    },
    [refreshLibrary, playTrack, handlePlayerError],
  )

  const playBySourceUrlRef = useRef(playBySourceUrl)
  playBySourceUrlRef.current = playBySourceUrl

  useEffect(() => {
    if (!apiReady) return
    void refreshLibrary()
    return getApi().onLibraryChanged(() => {
      void refreshLibrary()
    })
  }, [apiReady, refreshLibrary])

  // Autoplay lives in App so it survives SearchScreen remounts/HMR.
  useEffect(() => {
    if (!apiReady) return

    const maybeAutoplay = (sourceUrl: string | null | undefined) => {
      if (!sourceUrl || !autoplayUrlsRef.current.has(sourceUrl)) return
      autoplayUrlsRef.current.delete(sourceUrl)
      void playBySourceUrlRef.current(sourceUrl)
    }

    const offProgress = getApi().onDownloadProgress((event) => {
      if (event.status === 'completed') {
        maybeAutoplay(event.sourceUrl)
      }
    })

    const offLibrary = getApi().onLibraryChanged(() => {
      void refreshLibrary().then((nextTracks) => {
        for (const sourceUrl of [...autoplayUrlsRef.current]) {
          if (nextTracks.some((track) => track.sourceUrl === sourceUrl)) {
            maybeAutoplay(sourceUrl)
          }
        }
      })
    })

    return () => {
      offProgress()
      offLibrary()
    }
  }, [apiReady, refreshLibrary])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        void player.togglePlay().catch(handlePlayerError)
        return
      }

      if (event.code === 'ArrowRight') {
        event.preventDefault()
        player.seek(player.currentTime + 5)
        return
      }

      if (event.code === 'ArrowLeft') {
        event.preventDefault()
        player.seek(Math.max(0, player.currentTime - 5))
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!apiReady) {
    return (
      <div className="flex h-full items-center justify-center bg-black px-6 text-center text-[#b3b3b3]">
        <div className="max-w-md space-y-3">
          <div className="text-2xl font-extrabold text-[#1ed760]">Sourney</div>
          <p className="text-sm">
            Open the desktop window from <code className="text-white">npm run dev</code>, not a
            browser tab.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-black text-white">
      <div className="flex min-h-0 flex-1 gap-2 p-2 pb-0">
        <aside className="flex w-[240px] shrink-0 flex-col gap-2">
          <div className="rounded-xl bg-[#121212] px-4 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-[#1ed760]">
                <img src="/icon.png" alt="" className="h-full w-full object-cover" />
              </div>
              <div>
                <div className="text-lg font-extrabold tracking-tight">Sourney</div>
                <div className="text-xs text-[#b3b3b3]">Local music</div>
              </div>
            </div>
          </div>

          <nav className="flex flex-1 flex-col rounded-xl bg-[#121212] p-2">
            {TABS.map((item) => (
              <button
                key={item.id}
                className={`nav-item ${tab === item.id ? 'is-active' : ''}`}
                onClick={() => setTab(item.id)}
              >
                <span className="w-5 text-center text-lg leading-none">{item.icon}</span>
                {item.label}
              </button>
            ))}

            <div className="mt-auto px-3 pb-3 pt-6 text-xs text-[#6a6a6a]">
              {tracks.length} song{tracks.length === 1 ? '' : 's'} in library
            </div>
          </nav>
        </aside>

        <main className="surface min-w-0 flex-1 overflow-y-auto rounded-xl">
          <div className="px-6 py-6 pb-28 md:px-8">
            {(libraryError || playerError) && (
              <p className="banner-error mb-4">{libraryError || playerError}</p>
            )}

            {tab === 'search' && (
              <SearchScreen
                currentSourceUrl={player.currentTrack?.sourceUrl ?? null}
                isPlaying={player.isPlaying}
                onPlayBySourceUrl={(sourceUrl) => void playBySourceUrl(sourceUrl)}
                onPause={player.pause}
                onQueueAutoplay={(sourceUrl) => {
                  autoplayUrlsRef.current.add(sourceUrl)
                }}
              />
            )}
            {tab === 'downloads' && <DownloadsScreen />}
            {tab === 'library' && (
              <LibraryScreen
                tracks={tracks}
                currentTrackId={player.currentTrack?.id ?? null}
                isPlaying={player.isPlaying}
                onPlay={(track) => void playTrack(track)}
                onPause={player.pause}
                onTracksChanged={() => void refreshLibrary()}
              />
            )}
            {tab === 'settings' && <SettingsScreen />}
          </div>
        </main>
      </div>

      <PlayerBar
        track={player.currentTrack}
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        duration={player.duration}
        volume={player.volume}
        onTogglePlay={() => {
          void player.togglePlay().catch(handlePlayerError)
        }}
        onStop={player.stop}
        onPrevious={() => {
          void player.playPrevious().catch(handlePlayerError)
        }}
        onNext={() => {
          void player.playNext().catch(handlePlayerError)
        }}
        onSeek={player.seek}
        onVolume={player.setVolume}
      />
    </div>
  )
}
