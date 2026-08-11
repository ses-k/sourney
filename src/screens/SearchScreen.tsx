import { useEffect, useMemo, useRef, useState } from 'react'
import type { DownloadProgressEvent, SearchResult } from '../../shared/types'
import { getApi } from '../api/client'
import {
  addStateFromDownload,
  DownloadAddButton,
  type AddButtonState,
} from '../components/DownloadAddButton'
import { formatDuration, formatError } from '../lib/format'

interface SearchScreenProps {
  currentSourceUrl?: string | null
  isPlaying?: boolean
  onPlayBySourceUrl?: (sourceUrl: string) => void
  onPause?: () => void
  /** Register a source URL so App autoplays it when the download finishes. */
  onQueueAutoplay?: (sourceUrl: string) => void
}

const DEBOUNCE_MS = 220
const MIN_QUERY_LENGTH = 2

type DownloadUi = {
  downloadId: string
  status: DownloadProgressEvent['status']
  progress: number
}

export function SearchScreen({
  currentSourceUrl = null,
  isPlaying = false,
  onPlayBySourceUrl,
  onPause,
  onQueueAutoplay,
}: SearchScreenProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [libraryUrls, setLibraryUrls] = useState<Set<string>>(() => new Set())
  const [downloadsByUrl, setDownloadsByUrl] = useState<Record<string, DownloadUi>>({})
  const requestIdRef = useRef<string | null>(null)
  const replaceOnNextResultRef = useRef(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const latestQueryRef = useRef('')
  const downloadIdToUrlRef = useRef<Record<string, string>>({})

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const api = getApi()

    const refreshLibraryUrls = async () => {
      try {
        const tracks = await api.getTracks()
        setLibraryUrls(
          new Set(tracks.map((track) => track.sourceUrl).filter(Boolean) as string[]),
        )
      } catch {
        // non-blocking
      }
    }

    const refreshDownloads = async () => {
      try {
        const items = await api.listDownloads()
        const next: Record<string, DownloadUi> = {}
        const idMap: Record<string, string> = {}
        for (const item of items) {
          idMap[item.id] = item.sourceUrl
          next[item.sourceUrl] = {
            downloadId: item.id,
            status: item.status,
            progress: item.progress,
          }
        }
        downloadIdToUrlRef.current = idMap
        setDownloadsByUrl(next)
      } catch {
        // non-blocking
      }
    }

    void refreshLibraryUrls()
    void refreshDownloads()

    const offLibrary = api.onLibraryChanged(() => {
      void refreshLibraryUrls()
    })

    const offProgress = api.onDownloadProgress((event) => {
      const mappedUrl = event.sourceUrl || downloadIdToUrlRef.current[event.id]

      setDownloadsByUrl((prev) => {
        const sourceUrl =
          mappedUrl ||
          Object.entries(prev).find(([, value]) => value.downloadId === event.id)?.[0]
        if (!sourceUrl) return prev
        if (event.id) downloadIdToUrlRef.current[event.id] = sourceUrl

        return {
          ...prev,
          [sourceUrl]: {
            downloadId: event.id,
            status: event.status,
            progress: event.progress,
          },
        }
      })

      if (event.status === 'completed') {
        void refreshLibraryUrls()
      }
    })

    return () => {
      offLibrary()
      offProgress()
    }
  }, [])

  useEffect(() => {
    const api = getApi()
    const offResult = api.onSearchResult(({ requestId, result }) => {
      if (requestIdRef.current !== requestId) return

      setResults((prev) => {
        if (replaceOnNextResultRef.current) {
          replaceOnNextResultRef.current = false
          return [result]
        }
        if (prev.some((item) => item.id === result.id && item.sourceUrl === result.sourceUrl)) {
          return prev
        }
        return [...prev, result]
      })
      setLoading(true)
      setError(null)
    })

    const offDone = api.onSearchDone(({ requestId }) => {
      if (requestIdRef.current !== requestId) return
      setLoading(false)
      requestIdRef.current = null
      replaceOnNextResultRef.current = false
    })

    const offError = api.onSearchError(({ requestId, message }) => {
      if (requestIdRef.current !== requestId) return
      setLoading(false)
      requestIdRef.current = null
      replaceOnNextResultRef.current = false
      setError(message || 'Search failed.')
    })

    return () => {
      offResult()
      offDone()
      offError()
      if (requestIdRef.current) {
        void api.cancelSearch(requestIdRef.current)
      }
    }
  }, [])

  useEffect(() => {
    latestQueryRef.current = query
    const trimmed = query.trim()
    const api = getApi()

    if (trimmed.length < MIN_QUERY_LENGTH) {
      if (requestIdRef.current) {
        void api.cancelSearch(requestIdRef.current)
        requestIdRef.current = null
      }
      replaceOnNextResultRef.current = false
      setLoading(false)
      setError(null)
      setResults([])
      return
    }

    setLoading(true)
    setError(null)

    const timer = window.setTimeout(() => {
      void (async () => {
        if (latestQueryRef.current.trim() !== trimmed) return

        if (requestIdRef.current) {
          await api.cancelSearch(requestIdRef.current)
          requestIdRef.current = null
        }

        replaceOnNextResultRef.current = true

        try {
          const { requestId } = await api.startSearch(trimmed)
          if (latestQueryRef.current.trim() !== trimmed) {
            await api.cancelSearch(requestId)
            return
          }
          requestIdRef.current = requestId
        } catch (err) {
          if (latestQueryRef.current.trim() !== trimmed) return
          setLoading(false)
          requestIdRef.current = null
          replaceOnNextResultRef.current = false
          setResults([])
          setError(formatError(err, 'Search failed.'))
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
    }
  }, [query])

  const onDownload = async (result: SearchResult) => {
    setError(null)
    onQueueAutoplay?.(result.sourceUrl)
    try {
      const existing = downloadsByUrl[result.sourceUrl]
      if (
        existing &&
        (existing.status === 'failed' || existing.status === 'cancelled')
      ) {
        const item = await getApi().retryDownload(existing.downloadId)
        downloadIdToUrlRef.current[item.id] = item.sourceUrl
        setDownloadsByUrl((prev) => ({
          ...prev,
          [item.sourceUrl]: {
            downloadId: item.id,
            status: item.status,
            progress: item.progress,
          },
        }))
        return
      }

      const item = await getApi().enqueueDownload({
        title: result.title,
        artist: result.artist,
        sourceUrl: result.sourceUrl,
        thumbnailUrl: result.thumbnailUrl,
        duration: result.duration,
      })
      downloadIdToUrlRef.current[item.id] = item.sourceUrl
      setDownloadsByUrl((prev) => ({
        ...prev,
        [item.sourceUrl]: {
          downloadId: item.id,
          status: item.status,
          progress: item.progress,
        },
      }))
    } catch (err) {
      const message = formatError(err, 'Could not start download.')
      if (/already in your library/i.test(message)) {
        onPlayBySourceUrl?.(result.sourceUrl)
        return
      }
      setError(message)
    }
  }

  const onRowAction = (result: SearchResult, state: AddButtonState) => {
    if (state.kind === 'done') {
      const playingHere = result.sourceUrl === currentSourceUrl && isPlaying
      if (playingHere) onPause?.()
      else onPlayBySourceUrl?.(result.sourceUrl)
      return
    }
    if (state.kind === 'queued' || state.kind === 'downloading') return
    void onDownload(result)
  }

  const buttonStateFor = useMemo(() => {
    return (sourceUrl: string): AddButtonState => {
      if (libraryUrls.has(sourceUrl) || downloadsByUrl[sourceUrl]?.status === 'completed') {
        return {
          kind: 'done',
          playing: sourceUrl === currentSourceUrl && isPlaying,
        }
      }
      const download = downloadsByUrl[sourceUrl]
      return addStateFromDownload(download?.status, download?.progress ?? 0) ?? { kind: 'idle' }
    }
  }, [libraryUrls, downloadsByUrl, currentSourceUrl, isPlaying])

  const trimmed = query.trim()

  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Search</h1>
        <div className="relative max-w-2xl">
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-[#b3b3b3]">
            ⌕
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="What do you want to listen to?"
            className="field w-full !pl-11"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-sm text-[#b3b3b3] hover:text-white"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {error && <p className="banner-error">{error}</p>}

      <div className="space-y-1">
        {results.map((result, index) => {
          const state = buttonStateFor(result.sourceUrl)
          const playable = state.kind === 'done'
          const active = result.sourceUrl === currentSourceUrl
          return (
            <article
              key={`${result.id}-${result.sourceUrl}`}
              className={`track-row track-row-search animate-[fadeIn_0.2s_ease] ${
                playable ? 'cursor-pointer' : ''
              } ${active ? 'is-active' : ''}`}
              onClick={() => {
                if (playable) onRowAction(result, state)
              }}
            >
              <DownloadAddButton state={state} onClick={() => onRowAction(result, state)} />
              <div className="track-index">{index + 1}</div>
              <div className="relative h-12 w-12 overflow-hidden rounded bg-[#282828]">
                <div className="absolute inset-0 flex items-center justify-center text-[#6a6a6a]">♪</div>
                {result.thumbnailUrl && (
                  <img
                    src={result.thumbnailUrl}
                    alt=""
                    className="relative h-full w-full object-cover"
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                )}
              </div>
              <div className="min-w-0">
                <div className={`truncate font-semibold ${active ? 'text-[#1ed760]' : ''}`}>
                  {result.title}
                </div>
                <div className="truncate text-sm text-[#b3b3b3]">
                  {result.uploader || result.artist || 'Unknown artist'}
                </div>
              </div>
              <div className="hidden truncate text-sm text-[#b3b3b3] md:block">
                {result.sourceUrl.replace(/^https?:\/\//, '')}
              </div>
              <div className="text-sm tabular-nums text-[#b3b3b3]">
                {formatDuration(result.duration)}
              </div>
            </article>
          )
        })}

        {loading && results.length > 0 && (
          <p className="px-3 py-3 text-sm text-[#b3b3b3]">Finding more songs…</p>
        )}

        {loading && results.length === 0 && trimmed.length >= MIN_QUERY_LENGTH && (
          <p className="pt-8 text-sm text-[#b3b3b3]">Searching…</p>
        )}

        {!loading && results.length === 0 && !error && trimmed.length < MIN_QUERY_LENGTH && (
          <p className="pt-8 text-sm text-[#b3b3b3]">
            Start typing a song or artist — results appear as you type.
          </p>
        )}

        {!loading && results.length === 0 && !error && trimmed.length >= MIN_QUERY_LENGTH && (
          <p className="pt-8 text-sm text-[#b3b3b3]">No results for “{trimmed}”.</p>
        )}
      </div>
    </section>
  )
}
