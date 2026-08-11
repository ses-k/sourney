/// <reference types="vite/client" />

import type {
  Album,
  AlbumDetail,
  AppSettings,
  DownloadItem,
  DownloadProgressEvent,
  EnqueueDownloadInput,
  SearchDoneEvent,
  SearchErrorEvent,
  SearchResult,
  SearchResultEvent,
  ToolStatus,
  Track,
} from '../shared/types'

interface SourneyApi {
  search: (query: string) => Promise<SearchResult[]>
  startSearch: (query: string) => Promise<{ requestId: string }>
  cancelSearch: (requestId?: string) => Promise<boolean>
  onSearchResult: (listener: (event: SearchResultEvent) => void) => () => void
  onSearchDone: (listener: (event: SearchDoneEvent) => void) => () => void
  onSearchError: (listener: (event: SearchErrorEvent) => void) => () => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (partial: Partial<AppSettings>) => Promise<AppSettings>
  pickMusicDirectory: () => Promise<AppSettings>
  getToolStatus: () => Promise<ToolStatus>
  getTracks: () => Promise<Track[]>
  deleteTrack: (id: string) => Promise<Track[]>
  openTrackFolder: (id: string) => Promise<boolean>
  openPath: (targetPath: string) => Promise<boolean>
  showItemInFolder: (targetPath: string) => Promise<boolean>
  listAlbums: () => Promise<Album[]>
  getAlbum: (id: string) => Promise<AlbumDetail>
  createAlbum: (name: string) => Promise<Album>
  renameAlbum: (id: string, name: string) => Promise<Album>
  deleteAlbum: (id: string) => Promise<boolean>
  addTrackToAlbum: (albumId: string, trackId: string) => Promise<AlbumDetail>
  removeTrackFromAlbum: (albumId: string, trackId: string) => Promise<AlbumDetail>
  enqueueDownload: (input: EnqueueDownloadInput) => Promise<DownloadItem>
  listDownloads: () => Promise<DownloadItem[]>
  clearDownloads: () => Promise<DownloadItem[]>
  cancelDownload: (id: string) => Promise<DownloadItem>
  retryDownload: (id: string) => Promise<DownloadItem>
  onDownloadProgress: (listener: (event: DownloadProgressEvent) => void) => () => void
  onLibraryChanged: (listener: () => void) => () => void
}

declare global {
  interface Window {
    sourney: SourneyApi
  }
}

export {}
