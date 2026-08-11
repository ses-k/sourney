export type AudioFormat = 'mp3' | 'm4a' | 'opus' | 'flac' | 'wav'
export type AudioQuality = 'best' | 'high' | 'medium' | 'low'

export type DownloadStatus =
  | 'pending'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled'

export interface AppSettings {
  musicDirectory: string
  audioFormat: AudioFormat
  audioQuality: AudioQuality
}

export interface SearchResult {
  id: string
  title: string
  artist: string
  duration: number | null
  thumbnailUrl: string | null
  sourceUrl: string
  uploader: string | null
}

export interface SearchResultEvent {
  requestId: string
  result: SearchResult
}

export interface SearchDoneEvent {
  requestId: string
  count: number
}

export interface SearchErrorEvent {
  requestId: string
  message: string
}

export interface Track {
  id: string
  title: string
  artist: string
  album: string | null
  duration: number | null
  filePath: string
  artworkPath: string | null
  sourceUrl: string | null
  createdAt: string
  playUrl?: string
  artworkUrl?: string | null
}

export interface DownloadItem {
  id: string
  title: string
  artist: string
  sourceUrl: string
  thumbnailUrl: string | null
  duration: number | null
  status: DownloadStatus
  progress: number
  speed: string | null
  statusText: string | null
  error: string | null
  filePath: string | null
  createdAt: string
  updatedAt: string
}

export interface DownloadProgressEvent {
  id: string
  sourceUrl?: string | null
  progress: number
  speed: string | null
  statusText?: string | null
  status: DownloadStatus
  error?: string | null
  filePath?: string | null
}

export interface EnqueueDownloadInput {
  title: string
  artist: string
  sourceUrl: string
  thumbnailUrl?: string | null
  duration?: number | null
}

export interface ToolStatus {
  ytDlp: boolean
  ffmpeg: boolean
  message: string
}

/** User-created local album (collection of library tracks). */
export interface Album {
  id: string
  name: string
  trackCount: number
  createdAt: string
  updatedAt: string
  artworkPath?: string | null
  artworkUrl?: string | null
}

export interface AlbumDetail extends Album {
  tracks: Track[]
}
