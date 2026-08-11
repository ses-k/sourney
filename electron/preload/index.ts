import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IpcChannels } from '../../shared/channels'
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
} from '../../shared/types'

export interface SourneyApi {
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

const api: SourneyApi = {
  search: (query) => ipcRenderer.invoke(IpcChannels.search, query),
  startSearch: (query) => ipcRenderer.invoke(IpcChannels.searchStart, query),
  cancelSearch: (requestId) => ipcRenderer.invoke(IpcChannels.searchCancel, requestId),
  onSearchResult: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: SearchResultEvent) => listener(payload)
    ipcRenderer.on(IpcChannels.searchResult, handler)
    return () => ipcRenderer.off(IpcChannels.searchResult, handler)
  },
  onSearchDone: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: SearchDoneEvent) => listener(payload)
    ipcRenderer.on(IpcChannels.searchDone, handler)
    return () => ipcRenderer.off(IpcChannels.searchDone, handler)
  },
  onSearchError: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: SearchErrorEvent) => listener(payload)
    ipcRenderer.on(IpcChannels.searchError, handler)
    return () => ipcRenderer.off(IpcChannels.searchError, handler)
  },
  getSettings: () => ipcRenderer.invoke(IpcChannels.getSettings),
  saveSettings: (partial) => ipcRenderer.invoke(IpcChannels.saveSettings, partial),
  pickMusicDirectory: () => ipcRenderer.invoke(IpcChannels.pickMusicDirectory),
  getToolStatus: () => ipcRenderer.invoke(IpcChannels.getToolStatus),
  getTracks: () => ipcRenderer.invoke(IpcChannels.getTracks),
  deleteTrack: (id) => ipcRenderer.invoke(IpcChannels.deleteTrack, id),
  openTrackFolder: (id) => ipcRenderer.invoke(IpcChannels.openTrackFolder, id),
  openPath: (targetPath) => ipcRenderer.invoke(IpcChannels.openPath, targetPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke(IpcChannels.showItemInFolder, targetPath),
  listAlbums: () => ipcRenderer.invoke(IpcChannels.listAlbums),
  getAlbum: (id) => ipcRenderer.invoke(IpcChannels.getAlbum, id),
  createAlbum: (name) => ipcRenderer.invoke(IpcChannels.createAlbum, name),
  renameAlbum: (id, name) => ipcRenderer.invoke(IpcChannels.renameAlbum, id, name),
  deleteAlbum: (id) => ipcRenderer.invoke(IpcChannels.deleteAlbum, id),
  addTrackToAlbum: (albumId, trackId) =>
    ipcRenderer.invoke(IpcChannels.addTrackToAlbum, albumId, trackId),
  removeTrackFromAlbum: (albumId, trackId) =>
    ipcRenderer.invoke(IpcChannels.removeTrackFromAlbum, albumId, trackId),
  enqueueDownload: (input) => ipcRenderer.invoke(IpcChannels.enqueueDownload, input),
  listDownloads: () => ipcRenderer.invoke(IpcChannels.listDownloads),
  clearDownloads: () => ipcRenderer.invoke(IpcChannels.clearDownloads),
  cancelDownload: (id) => ipcRenderer.invoke(IpcChannels.cancelDownload, id),
  retryDownload: (id) => ipcRenderer.invoke(IpcChannels.retryDownload, id),
  onDownloadProgress: (listener) => {
    const handler = (_event: IpcRendererEvent, payload: DownloadProgressEvent) => listener(payload)
    ipcRenderer.on(IpcChannels.downloadProgress, handler)
    return () => ipcRenderer.off(IpcChannels.downloadProgress, handler)
  },
  onLibraryChanged: (listener) => {
    const handler = () => listener()
    ipcRenderer.on(IpcChannels.libraryChanged, handler)
    return () => ipcRenderer.off(IpcChannels.libraryChanged, handler)
  },
}

contextBridge.exposeInMainWorld('sourney', api)

window.addEventListener('DOMContentLoaded', () => {
  window.postMessage({ payload: 'removeLoading' }, '*')
})
