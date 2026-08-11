import { shell } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Album, AlbumDetail, Track } from '../../shared/types'
import { Database } from './Database'
import { MetadataService } from './MetadataService'

export class LibraryService {
  constructor(
    private readonly db: Database,
    private readonly metadata: MetadataService,
  ) {}

  list(): Track[] {
    return this.db.listTracks()
  }

  /** Remove DB rows whose audio files are gone. Call explicitly, not on every list. */
  reconcileMissingFiles(): number {
    let removed = 0
    for (const track of this.db.listTracks()) {
      if (fs.existsSync(track.filePath)) continue
      this.db.deleteTrack(track.id)
      removed += 1
    }
    return removed
  }

  getBySourceUrl(sourceUrl: string): Track | null {
    if (!sourceUrl.trim()) return null
    return this.db.getTrackBySourceUrl(sourceUrl.trim())
  }

  async addFromDownload(input: {
    title: string
    artist: string
    album: string | null
    duration: number | null
    filePath: string
    artworkPath: string | null
    sourceUrl: string
  }): Promise<Track> {
    const existing =
      this.db.getTrackByFilePath(input.filePath) ??
      this.db.getTrackBySourceUrl(input.sourceUrl)

    const duration = await this.metadata.enrichDuration(input.filePath, input.duration)

    const track = this.metadata.normalizeTrackInput({
      id: existing?.id ?? randomUUID(),
      title: input.title,
      artist: input.artist,
      album: input.album,
      duration,
      filePath: input.filePath,
      artworkPath: input.artworkPath,
      sourceUrl: input.sourceUrl,
      createdAt: existing?.createdAt,
    })

    return this.db.upsertTrack(track)
  }

  delete(id: string, deleteFile = true): void {
    const track = this.db.deleteTrack(id)
    if (!track) {
      throw new Error('Track not found.')
    }

    const artistDir = path.dirname(track.filePath)

    if (deleteFile && fs.existsSync(track.filePath)) {
      fs.unlinkSync(track.filePath)
    }

    if (track.artworkPath && fs.existsSync(track.artworkPath)) {
      try {
        fs.unlinkSync(track.artworkPath)
      } catch {
        // best-effort
      }
    }

    removeDirIfEmpty(artistDir)
  }

  async openContainingFolder(id: string): Promise<void> {
    const track = this.db.getTrackById(id)
    if (!track) throw new Error('Track not found.')
    if (!fs.existsSync(track.filePath)) {
      throw new Error('Track file no longer exists on disk.')
    }
    shell.showItemInFolder(track.filePath)
  }

  listAlbums(): Album[] {
    return this.db.listAlbums()
  }

  getAlbum(id: string): AlbumDetail {
    const album = this.db.getAlbum(id)
    if (!album) throw new Error('Album not found.')
    return album
  }

  createAlbum(name: string): Album {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Album name cannot be empty.')
    const now = new Date().toISOString()
    return this.db.createAlbum(randomUUID(), trimmed, now)
  }

  renameAlbum(id: string, name: string): Album {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('Album name cannot be empty.')
    const album = this.db.renameAlbum(id, trimmed, new Date().toISOString())
    if (!album) throw new Error('Album not found.')
    return album
  }

  deleteAlbum(id: string): void {
    if (!this.db.deleteAlbum(id)) {
      throw new Error('Album not found.')
    }
  }

  addTrackToAlbum(albumId: string, trackId: string): AlbumDetail {
    const ok = this.db.addTrackToAlbum(albumId, trackId, new Date().toISOString())
    if (!ok) throw new Error('Could not add song to album.')
    return this.getAlbum(albumId)
  }

  removeTrackFromAlbum(albumId: string, trackId: string): AlbumDetail {
    const ok = this.db.removeTrackFromAlbum(albumId, trackId, new Date().toISOString())
    if (!ok) throw new Error('Song is not in this album.')
    return this.getAlbum(albumId)
  }
}

function removeDirIfEmpty(dir: string): void {
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return
    const entries = fs.readdirSync(dir)
    if (entries.length === 0) {
      fs.rmdirSync(dir)
    }
  } catch {
    // best-effort
  }
}
