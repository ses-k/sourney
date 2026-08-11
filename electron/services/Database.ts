import { DatabaseSync } from 'node:sqlite'
import type { Album, AlbumDetail, Track } from '../../shared/types'
import { ensureDirectory, getDbPath, getUserDataDir } from './paths'

export class Database {
  private db: DatabaseSync

  constructor(dbPath = getDbPath()) {
    ensureDirectory(getUserDataDir())
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT,
        duration REAL,
        file_path TEXT NOT NULL UNIQUE,
        artwork_path TEXT,
        source_url TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
      CREATE INDEX IF NOT EXISTS idx_tracks_created_at ON tracks(created_at);
      CREATE INDEX IF NOT EXISTS idx_tracks_source_url ON tracks(source_url);

      CREATE TABLE IF NOT EXISTS albums (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS album_tracks (
        album_id TEXT NOT NULL,
        track_id TEXT NOT NULL,
        position INTEGER NOT NULL DEFAULT 0,
        added_at TEXT NOT NULL,
        PRIMARY KEY (album_id, track_id),
        FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
        FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_album_tracks_track ON album_tracks(track_id);
      CREATE INDEX IF NOT EXISTS idx_albums_updated ON albums(updated_at);
    `)
  }

  listTracks(): Track[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, artist, album, duration, file_path, artwork_path, source_url, created_at
         FROM tracks
         ORDER BY created_at DESC`,
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => this.mapTrack(row))
  }

  getTrackById(id: string): Track | null {
    const row = this.db
      .prepare(
        `SELECT id, title, artist, album, duration, file_path, artwork_path, source_url, created_at
         FROM tracks WHERE id = ?`,
      )
      .get(id) as Record<string, unknown> | undefined

    return row ? this.mapTrack(row) : null
  }

  getTrackByFilePath(filePath: string): Track | null {
    const row = this.db
      .prepare(
        `SELECT id, title, artist, album, duration, file_path, artwork_path, source_url, created_at
         FROM tracks WHERE file_path = ?`,
      )
      .get(filePath) as Record<string, unknown> | undefined

    return row ? this.mapTrack(row) : null
  }

  getTrackBySourceUrl(sourceUrl: string): Track | null {
    const row = this.db
      .prepare(
        `SELECT id, title, artist, album, duration, file_path, artwork_path, source_url, created_at
         FROM tracks WHERE source_url = ? LIMIT 1`,
      )
      .get(sourceUrl) as Record<string, unknown> | undefined

    return row ? this.mapTrack(row) : null
  }

  upsertTrack(track: Track): Track {
    this.db
      .prepare(
        `INSERT INTO tracks (
          id, title, artist, album, duration, file_path, artwork_path, source_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(file_path) DO UPDATE SET
          title = excluded.title,
          artist = excluded.artist,
          album = excluded.album,
          duration = excluded.duration,
          artwork_path = excluded.artwork_path,
          source_url = excluded.source_url`,
      )
      .run(
        track.id,
        track.title,
        track.artist,
        track.album,
        track.duration,
        track.filePath,
        track.artworkPath,
        track.sourceUrl,
        track.createdAt,
      )

    return this.getTrackByFilePath(track.filePath) ?? track
  }

  deleteTrack(id: string): Track | null {
    const existing = this.getTrackById(id)
    if (!existing) return null
    this.db.prepare('DELETE FROM album_tracks WHERE track_id = ?').run(id)
    this.db.prepare('DELETE FROM tracks WHERE id = ?').run(id)
    return existing
  }

  listAlbums(): Album[] {
    const rows = this.db
      .prepare(
        `SELECT
           a.id,
           a.name,
           a.created_at,
           a.updated_at,
           COUNT(at.track_id) AS track_count,
           (
             SELECT t.artwork_path
             FROM album_tracks at2
             JOIN tracks t ON t.id = at2.track_id
             WHERE at2.album_id = a.id AND t.artwork_path IS NOT NULL
             ORDER BY at2.position ASC, at2.added_at ASC
             LIMIT 1
           ) AS artwork_path
         FROM albums a
         LEFT JOIN album_tracks at ON at.album_id = a.id
         GROUP BY a.id
         ORDER BY a.updated_at DESC`,
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => this.mapAlbum(row))
  }

  getAlbum(id: string): AlbumDetail | null {
    const row = this.db
      .prepare(
        `SELECT
           a.id,
           a.name,
           a.created_at,
           a.updated_at,
           COUNT(at.track_id) AS track_count,
           (
             SELECT t.artwork_path
             FROM album_tracks at2
             JOIN tracks t ON t.id = at2.track_id
             WHERE at2.album_id = a.id AND t.artwork_path IS NOT NULL
             ORDER BY at2.position ASC, at2.added_at ASC
             LIMIT 1
           ) AS artwork_path
         FROM albums a
         LEFT JOIN album_tracks at ON at.album_id = a.id
         WHERE a.id = ?
         GROUP BY a.id`,
      )
      .get(id) as Record<string, unknown> | undefined

    if (!row) return null

    const trackRows = this.db
      .prepare(
        `SELECT t.id, t.title, t.artist, t.album, t.duration, t.file_path, t.artwork_path,
                t.source_url, t.created_at
         FROM album_tracks at
         JOIN tracks t ON t.id = at.track_id
         WHERE at.album_id = ?
         ORDER BY at.position ASC, at.added_at ASC`,
      )
      .all(id) as Array<Record<string, unknown>>

    return {
      ...this.mapAlbum(row),
      tracks: trackRows.map((trackRow) => this.mapTrack(trackRow)),
    }
  }

  createAlbum(id: string, name: string, createdAt: string): Album {
    this.db
      .prepare(
        `INSERT INTO albums (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      )
      .run(id, name, createdAt, createdAt)

    return this.getAlbum(id) ?? {
      id,
      name,
      trackCount: 0,
      createdAt,
      updatedAt: createdAt,
      artworkPath: null,
    }
  }

  renameAlbum(id: string, name: string, updatedAt: string): Album | null {
    const result = this.db
      .prepare(`UPDATE albums SET name = ?, updated_at = ? WHERE id = ?`)
      .run(name, updatedAt, id)
    if (result.changes === 0) return null
    return this.getAlbum(id)
  }

  deleteAlbum(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM albums WHERE id = ?`).run(id)
    return result.changes > 0
  }

  addTrackToAlbum(albumId: string, trackId: string, addedAt: string): boolean {
    const album = this.getAlbum(albumId)
    if (!album) return false
    if (!this.getTrackById(trackId)) return false

    const existing = this.db
      .prepare(`SELECT 1 FROM album_tracks WHERE album_id = ? AND track_id = ?`)
      .get(albumId, trackId)
    if (existing) return true

    const maxRow = this.db
      .prepare(`SELECT COALESCE(MAX(position), -1) AS max_pos FROM album_tracks WHERE album_id = ?`)
      .get(albumId) as { max_pos: number }

    this.db
      .prepare(
        `INSERT INTO album_tracks (album_id, track_id, position, added_at) VALUES (?, ?, ?, ?)`,
      )
      .run(albumId, trackId, Number(maxRow.max_pos) + 1, addedAt)

    this.db
      .prepare(`UPDATE albums SET updated_at = ? WHERE id = ?`)
      .run(addedAt, albumId)

    return true
  }

  removeTrackFromAlbum(albumId: string, trackId: string, updatedAt: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM album_tracks WHERE album_id = ? AND track_id = ?`)
      .run(albumId, trackId)
    if (result.changes === 0) return false

    this.db
      .prepare(`UPDATE albums SET updated_at = ? WHERE id = ?`)
      .run(updatedAt, albumId)

    return true
  }

  close(): void {
    this.db.close()
  }

  private mapAlbum(row: Record<string, unknown>): Album {
    return {
      id: String(row.id),
      name: String(row.name),
      trackCount: Number(row.track_count ?? 0),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      artworkPath: row.artwork_path == null ? null : String(row.artwork_path),
    }
  }

  private mapTrack(row: Record<string, unknown>): Track {
    return {
      id: String(row.id),
      title: String(row.title),
      artist: String(row.artist),
      album: row.album == null ? null : String(row.album),
      duration: row.duration == null ? null : Number(row.duration),
      filePath: String(row.file_path),
      artworkPath: row.artwork_path == null ? null : String(row.artwork_path),
      sourceUrl: row.source_url == null ? null : String(row.source_url),
      createdAt: String(row.created_at),
    }
  }
}
