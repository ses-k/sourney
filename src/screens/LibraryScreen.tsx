import { useEffect, useMemo, useState } from 'react'
import type { Album, AlbumDetail, Track } from '../../shared/types'
import { getApi } from '../api/client'
import { formatDuration, formatError } from '../lib/format'

interface LibraryScreenProps {
  tracks: Track[]
  currentTrackId: string | null
  isPlaying: boolean
  onPlay: (track: Track) => void
  onPause: () => void
  onTracksChanged: () => void
}

type LibraryTab = 'songs' | 'albums'

export function LibraryScreen({
  tracks,
  currentTrackId,
  isPlaying,
  onPlay,
  onPause,
  onTracksChanged,
}: LibraryScreenProps) {
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<LibraryTab>('songs')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'recent' | 'title' | 'artist'>('recent')

  const [albums, setAlbums] = useState<Album[]>([])
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null)
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [isRenaming, setIsRenaming] = useState(false)
  const [addingTracks, setAddingTracks] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [pickerTrackId, setPickerTrackId] = useState<string | null>(null)

  const refreshAlbums = async () => {
    try {
      const list = await getApi().listAlbums()
      setAlbums(list)
    } catch (err) {
      setError(formatError(err, 'Could not load albums.'))
    }
  }

  const loadAlbum = async (id: string) => {
    try {
      const detail = await getApi().getAlbum(id)
      setAlbumDetail(detail)
      setRenameValue(detail.name)
      setSelectedAlbumId(id)
    } catch (err) {
      setError(formatError(err, 'Could not open album.'))
    }
  }

  useEffect(() => {
    void refreshAlbums()
  }, [])

  useEffect(() => {
    if (!selectedAlbumId) {
      setAlbumDetail(null)
      return
    }
    void loadAlbum(selectedAlbumId)
  }, [selectedAlbumId, tracks])

  const filteredSongs = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = tracks
    if (q) {
      list = tracks.filter((track) => {
        const haystack = `${track.title} ${track.artist} ${track.album ?? ''}`.toLowerCase()
        return haystack.includes(q)
      })
    }

    if (sort === 'title') {
      return [...list].sort((a, b) => a.title.localeCompare(b.title))
    }
    if (sort === 'artist') {
      return [...list].sort(
        (a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title),
      )
    }
    return list
  }, [tracks, query, sort])

  const filteredAlbums = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return albums
    return albums.filter((album) => album.name.toLowerCase().includes(q))
  }, [albums, query])

  const tracksNotInAlbum = useMemo(() => {
    if (!albumDetail) return []
    const inAlbum = new Set(albumDetail.tracks.map((t) => t.id))
    const q = addQuery.trim().toLowerCase()
    return tracks.filter((track) => {
      if (inAlbum.has(track.id)) return false
      if (!q) return true
      const haystack = `${track.title} ${track.artist}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [albumDetail, tracks, addQuery])

  const onDelete = async (track: Track) => {
    const confirmed = window.confirm(`Delete “${track.title}” from the library and disk?`)
    if (!confirmed) return
    try {
      if (track.id === currentTrackId) onPause()
      await getApi().deleteTrack(track.id)
      onTracksChanged()
      await refreshAlbums()
      if (selectedAlbumId) await loadAlbum(selectedAlbumId)
    } catch (err) {
      setError(formatError(err, 'Could not delete track.'))
    }
  }

  const onOpenFolder = async (track: Track) => {
    try {
      await getApi().openTrackFolder(track.id)
    } catch (err) {
      setError(formatError(err, 'Could not open folder.'))
    }
  }

  const onCreateAlbum = async () => {
    const name = newAlbumName.trim()
    if (!name) return
    try {
      const album = await getApi().createAlbum(name)
      setNewAlbumName('')
      await refreshAlbums()
      setTab('albums')
      setSelectedAlbumId(album.id)
      setError(null)
    } catch (err) {
      setError(formatError(err, 'Could not create album.'))
    }
  }

  const onRenameAlbum = async () => {
    if (!selectedAlbumId) return
    const name = renameValue.trim()
    if (!name) return
    try {
      await getApi().renameAlbum(selectedAlbumId, name)
      setIsRenaming(false)
      await refreshAlbums()
      await loadAlbum(selectedAlbumId)
    } catch (err) {
      setError(formatError(err, 'Could not rename album.'))
    }
  }

  const onDeleteAlbum = async () => {
    if (!selectedAlbumId || !albumDetail) return
    const confirmed = window.confirm(
      `Delete album “${albumDetail.name}”? Songs stay in your library.`,
    )
    if (!confirmed) return
    try {
      await getApi().deleteAlbum(selectedAlbumId)
      setSelectedAlbumId(null)
      setAlbumDetail(null)
      setIsRenaming(false)
      await refreshAlbums()
    } catch (err) {
      setError(formatError(err, 'Could not delete album.'))
    }
  }

  const onAddToAlbum = async (albumId: string, trackId: string) => {
    try {
      await getApi().addTrackToAlbum(albumId, trackId)
      setPickerTrackId(null)
      setAddingTracks(false)
      setAddQuery('')
      await refreshAlbums()
      if (selectedAlbumId === albumId) await loadAlbum(albumId)
      setError(null)
    } catch (err) {
      setError(formatError(err, 'Could not add song to album.'))
    }
  }

  const onRemoveFromAlbum = async (trackId: string) => {
    if (!selectedAlbumId) return
    try {
      await getApi().removeTrackFromAlbum(selectedAlbumId, trackId)
      await refreshAlbums()
      await loadAlbum(selectedAlbumId)
    } catch (err) {
      setError(formatError(err, 'Could not remove song from album.'))
    }
  }

  const showAlbumDetail = tab === 'albums' && Boolean(selectedAlbumId)

  return (
    <section className="space-y-6">
      <header className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#b3b3b3]">
            Collection
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">Your Library</h1>
          <p className="text-sm text-[#b3b3b3]">
            {tab === 'songs'
              ? `${filteredSongs.length}${query.trim() ? ` of ${tracks.length}` : ''} song${
                  filteredSongs.length === 1 ? '' : 's'
                }`
              : showAlbumDetail && albumDetail
                ? `${albumDetail.trackCount} song${albumDetail.trackCount === 1 ? '' : 's'} in album`
                : `${filteredAlbums.length} album${filteredAlbums.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="library-tabs" role="tablist" aria-label="Library sections">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'songs'}
            className={`library-tab ${tab === 'songs' ? 'is-active' : ''}`}
            onClick={() => {
              setTab('songs')
              setSelectedAlbumId(null)
              setAddingTracks(false)
              setIsRenaming(false)
            }}
          >
            Songs
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'albums'}
            className={`library-tab ${tab === 'albums' ? 'is-active' : ''}`}
            onClick={() => {
              setTab('albums')
              setPickerTrackId(null)
            }}
          >
            Albums
          </button>
        </div>

        {!showAlbumDetail && (
          <div className="library-toolbar">
            <div className="library-search">
              <span className="library-search-icon" aria-hidden="true">
                ⌕
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  tab === 'songs' ? 'Search songs, artists, or albums' : 'Search albums'
                }
                className="library-search-input"
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  type="button"
                  className="library-search-clear"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {tab === 'songs' ? (
              <label className="library-sort">
                <span className="library-sort-label">Sort by</span>
                <select
                  className="library-sort-select"
                  value={sort}
                  onChange={(event) =>
                    setSort(event.target.value as 'recent' | 'title' | 'artist')
                  }
                  aria-label="Sort library"
                >
                  <option value="recent">Recently added</option>
                  <option value="title">Title A–Z</option>
                  <option value="artist">Artist A–Z</option>
                </select>
              </label>
            ) : (
              <form
                className="album-create"
                onSubmit={(event) => {
                  event.preventDefault()
                  void onCreateAlbum()
                }}
              >
                <input
                  value={newAlbumName}
                  onChange={(event) => setNewAlbumName(event.target.value)}
                  placeholder="New album name"
                  className="album-create-input"
                  maxLength={120}
                />
                <button type="submit" className="btn-primary !px-4" disabled={!newAlbumName.trim()}>
                  Create
                </button>
              </form>
            )}
          </div>
        )}
      </header>

      {error && <p className="banner-error">{error}</p>}

      {tab === 'songs' && (
        <TrackList
          tracks={filteredSongs}
          emptyLabel={
            tracks.length === 0
              ? 'No songs yet. Search and download something to fill your library.'
              : `No songs match “${query.trim()}”.`
          }
          currentTrackId={currentTrackId}
          isPlaying={isPlaying}
          onPlay={onPlay}
          onPause={onPause}
          albums={albums}
          pickerTrackId={pickerTrackId}
          onTogglePicker={(trackId) =>
            setPickerTrackId((current) => (current === trackId ? null : trackId))
          }
          onAddToAlbum={onAddToAlbum}
          onOpenFolder={onOpenFolder}
          onDelete={onDelete}
          showAlbumColumn
        />
      )}

      {tab === 'albums' && !showAlbumDetail && (
        <div className="space-y-4">
          {filteredAlbums.length > 0 ? (
            <div className="album-grid">
              {filteredAlbums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  className="album-card"
                  onClick={() => {
                    setSelectedAlbumId(album.id)
                    setAddingTracks(false)
                    setIsRenaming(false)
                  }}
                >
                  <div className="album-card-art">
                    {album.artworkUrl ? (
                      <img
                        src={album.artworkUrl}
                        alt=""
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    ) : (
                      <span aria-hidden="true">♪</span>
                    )}
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="truncate font-semibold">{album.name}</div>
                    <div className="truncate text-sm text-[#b3b3b3]">
                      {album.trackCount} song{album.trackCount === 1 ? '' : 's'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="pt-4 text-sm text-[#b3b3b3]">
              {albums.length === 0
                ? 'No albums yet. Create one above, then add songs from the Songs tab or inside the album.'
                : `No albums match “${query.trim()}”.`}
            </p>
          )}
        </div>
      )}

      {showAlbumDetail && (
        <div className="space-y-5">
          <div className="album-detail-header">
            <button
              type="button"
              className="btn-ghost !px-3 !py-1 text-sm"
              onClick={() => {
                setSelectedAlbumId(null)
                setAlbumDetail(null)
                setAddingTracks(false)
                setIsRenaming(false)
              }}
            >
              ← All albums
            </button>

            {!albumDetail ? (
              <p className="pt-4 text-sm text-[#b3b3b3]">Loading album…</p>
            ) : (
              <div className="album-detail-hero">
                <div className="album-detail-art">
                  {albumDetail.artworkUrl ? (
                    <img
                      src={albumDetail.artworkUrl}
                      alt=""
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : (
                    <span aria-hidden="true">♪</span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  {isRenaming ? (
                    <form
                      className="flex flex-wrap items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault()
                        void onRenameAlbum()
                      }}
                    >
                      <input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        className="album-create-input !max-w-md"
                        maxLength={120}
                        autoFocus
                      />
                      <button type="submit" className="btn-primary !px-3 !py-1 text-sm">
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn-ghost !px-3 !py-1 text-sm"
                        onClick={() => {
                          setIsRenaming(false)
                          setRenameValue(albumDetail.name)
                        }}
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <h2 className="truncate text-2xl font-extrabold md:text-4xl">
                      {albumDetail.name}
                    </h2>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary !px-4 !py-2 text-sm"
                      disabled={albumDetail.tracks.length === 0}
                      onClick={() => {
                        const first = albumDetail.tracks[0]
                        if (first) void onPlay(first)
                      }}
                    >
                      Play
                    </button>
                    <button
                      type="button"
                      className="btn-ghost !px-3 !py-2 text-sm"
                      onClick={() => {
                        setAddingTracks((open) => !open)
                        setAddQuery('')
                      }}
                    >
                      {addingTracks ? 'Done adding' : 'Add songs'}
                    </button>
                    {!isRenaming && (
                      <button
                        type="button"
                        className="btn-ghost !px-3 !py-2 text-sm"
                        onClick={() => setIsRenaming(true)}
                      >
                        Rename
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-danger !px-3 !py-2 text-sm"
                      onClick={() => void onDeleteAlbum()}
                    >
                      Delete album
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {albumDetail && addingTracks && (
            <div className="album-add-panel">
              <div className="library-search !h-12">
                <span className="library-search-icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  value={addQuery}
                  onChange={(event) => setAddQuery(event.target.value)}
                  placeholder="Find songs to add"
                  className="library-search-input"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="album-add-list">
                {tracksNotInAlbum.length === 0 ? (
                  <p className="text-sm text-[#b3b3b3]">
                    {tracks.length === 0
                      ? 'Download some songs first.'
                      : 'Every song in your library is already in this album.'}
                  </p>
                ) : (
                  tracksNotInAlbum.map((track) => (
                    <div key={track.id} className="album-add-row">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{track.title}</div>
                        <div className="truncate text-sm text-[#b3b3b3]">{track.artist}</div>
                      </div>
                      <button
                        type="button"
                        className="btn-primary !px-3 !py-1 text-xs"
                        onClick={() => void onAddToAlbum(albumDetail.id, track.id)}
                      >
                        Add
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {albumDetail && (
            <TrackList
              tracks={albumDetail.tracks}
              emptyLabel="This album is empty. Use Add songs to fill it."
              currentTrackId={currentTrackId}
              isPlaying={isPlaying}
              onPlay={onPlay}
              onPause={onPause}
              onOpenFolder={onOpenFolder}
              onDelete={onDelete}
              onRemoveFromAlbum={onRemoveFromAlbum}
              showAlbumColumn={false}
            />
          )}
        </div>
      )}
    </section>
  )
}

function TrackList({
  tracks,
  emptyLabel,
  currentTrackId,
  isPlaying,
  onPlay,
  onPause,
  albums,
  pickerTrackId,
  onTogglePicker,
  onAddToAlbum,
  onOpenFolder,
  onDelete,
  onRemoveFromAlbum,
  showAlbumColumn,
}: {
  tracks: Track[]
  emptyLabel: string
  currentTrackId: string | null
  isPlaying: boolean
  onPlay: (track: Track) => void
  onPause: () => void
  albums?: Album[]
  pickerTrackId?: string | null
  onTogglePicker?: (trackId: string) => void
  onAddToAlbum?: (albumId: string, trackId: string) => void
  onOpenFolder: (track: Track) => void
  onDelete: (track: Track) => void
  onRemoveFromAlbum?: (trackId: string) => void
  showAlbumColumn: boolean
}) {
  if (tracks.length === 0) {
    return <p className="pt-8 text-sm text-[#b3b3b3]">{emptyLabel}</p>
  }

  return (
    <div className="space-y-1">
      <div className="track-row !bg-transparent text-xs font-semibold uppercase tracking-wider text-[#b3b3b3]">
        <div />
        <div className="text-center">#</div>
        <div />
        <div>Title</div>
        <div className="hidden md:block">{showAlbumColumn ? 'Album' : ''}</div>
        <div>Time</div>
        <div />
      </div>

      {tracks.map((track, index) => {
        const active = track.id === currentTrackId
        const playingHere = active && isPlaying
        const togglePlay = () => {
          if (playingHere) onPause()
          else void onPlay(track)
        }
        const pickerOpen = pickerTrackId === track.id

        return (
          <article
            key={track.id}
            role="button"
            tabIndex={0}
            className={`track-row group cursor-pointer ${active ? 'is-active' : ''}`}
            onClick={togglePlay}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                togglePlay()
              }
            }}
          >
            <button
              type="button"
              className={`btn-track-play ${playingHere ? 'is-playing' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                togglePlay()
              }}
              aria-label={playingHere ? 'Pause' : 'Play'}
            >
              {playingHere ? <PauseIcon /> : <PlayIcon />}
            </button>

            <div className="track-index">{index + 1}</div>

            <div className="h-12 w-12 overflow-hidden rounded bg-[#282828]">
              {track.artworkUrl ? (
                <img
                  src={track.artworkUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = 'none'
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#6a6a6a]">♪</div>
              )}
            </div>

            <div className="min-w-0">
              <div className={`truncate font-semibold ${active ? 'text-[#1ed760]' : ''}`}>
                {track.title}
              </div>
              <div className="truncate text-sm text-[#b3b3b3]">{track.artist}</div>
            </div>

            <div className="hidden truncate text-sm text-[#b3b3b3] md:block">
              {showAlbumColumn ? track.album ?? '—' : ''}
            </div>

            <div className="text-sm tabular-nums text-[#b3b3b3]">
              {formatDuration(track.duration)}
            </div>

            <div
              className="relative flex justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100"
              onClick={(event) => event.stopPropagation()}
            >
              {onRemoveFromAlbum && (
                <button
                  className="btn-ghost !px-3 !py-1 text-xs"
                  onClick={() => onRemoveFromAlbum(track.id)}
                >
                  Remove
                </button>
              )}
              {albums && onTogglePicker && onAddToAlbum && (
                <div className="relative">
                  <button
                    className="btn-ghost !px-3 !py-1 text-xs"
                    onClick={() => onTogglePicker(track.id)}
                  >
                    To album
                  </button>
                  {pickerOpen && (
                    <div className="album-picker">
                      {albums.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-[#b3b3b3]">
                          Create an album in the Albums tab first.
                        </p>
                      ) : (
                        albums.map((album) => (
                          <button
                            key={album.id}
                            type="button"
                            className="album-picker-item"
                            onClick={() => onAddToAlbum(album.id, track.id)}
                          >
                            {album.name}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              <button
                className="btn-ghost !px-3 !py-1 text-xs"
                onClick={() => void onOpenFolder(track)}
              >
                Folder
              </button>
              <button className="btn-danger !px-3 !py-1 text-xs" onClick={() => void onDelete(track)}>
                Delete
              </button>
            </div>
          </article>
        )
      })}
    </div>
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
