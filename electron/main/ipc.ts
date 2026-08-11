import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import path from 'node:path'
import { IpcChannels } from '../../shared/channels'
import type { AppSettings, EnqueueDownloadInput } from '../../shared/types'
import { DownloadService } from '../services/DownloadService'
import { LibraryService } from '../services/LibraryService'
import { SearchService } from '../services/SearchService'
import { SettingsService } from '../services/SettingsService'
import { YtDlpService } from '../services/YtDlpService'
import { getDefaultMusicDirectory } from '../services/paths'
import { setMediaAllowedRoots, toMediaUrl } from './mediaProtocol'

export function registerIpcHandlers(deps: {
  search: SearchService
  downloads: DownloadService
  library: LibraryService
  settings: SettingsService
  ytDlp: YtDlpService
  getWindow: () => BrowserWindow | null
}): void {
  const { search, downloads, library, settings, ytDlp, getWindow } = deps

  ipcMain.handle(IpcChannels.search, async (_event, query: string) => {
    return search.search(query)
  })

  ipcMain.handle(IpcChannels.searchStart, async (_event, query: string) => {
    const win = getWindow()
    const requestId = search.startStream(query, {
      onResult: (id, result) => {
        win?.webContents.send(IpcChannels.searchResult, { requestId: id, result })
      },
      onDone: (id, count) => {
        win?.webContents.send(IpcChannels.searchDone, { requestId: id, count })
      },
      onError: (id, message) => {
        win?.webContents.send(IpcChannels.searchError, { requestId: id, message })
      },
    })
    return { requestId }
  })

  ipcMain.handle(IpcChannels.searchCancel, async (_event, requestId?: string) => {
    search.cancel(requestId)
    return true
  })

  ipcMain.handle(IpcChannels.getSettings, async () => settings.get())

  ipcMain.handle(IpcChannels.saveSettings, async (_event, partial: Partial<AppSettings>) => {
    const saved = settings.save(partial)
    setMediaAllowedRoots([saved.musicDirectory, getDefaultMusicDirectory()])
    return saved
  })

  ipcMain.handle(IpcChannels.pickMusicDirectory, async () => {
    const win = getWindow()
    const dialogOpts = {
      title: 'Choose music download folder',
      properties: ['openDirectory', 'createDirectory'] as Array<
        'openDirectory' | 'createDirectory'
      >,
      defaultPath: settings.get().musicDirectory,
    }
    const result = win
      ? await dialog.showOpenDialog(win, dialogOpts)
      : await dialog.showOpenDialog(dialogOpts)

    if (result.canceled || result.filePaths.length === 0) {
      return settings.get()
    }

    const saved = settings.save({ musicDirectory: result.filePaths[0] })
    setMediaAllowedRoots([saved.musicDirectory, getDefaultMusicDirectory()])
    return saved
  })

  ipcMain.handle(IpcChannels.getToolStatus, async () => ytDlp.checkTools())

  const withMedia = <T extends { filePath: string; artworkPath?: string | null }>(track: T) => ({
    ...track,
    playUrl: toMediaUrl(track.filePath),
    artworkUrl: track.artworkPath ? toMediaUrl(track.artworkPath) : null,
  })

  const withAlbumMedia = (album: {
    artworkPath?: string | null
    tracks?: Array<{ filePath: string; artworkPath?: string | null }>
  }) => ({
    ...album,
    artworkUrl: album.artworkPath ? toMediaUrl(album.artworkPath) : null,
    tracks: album.tracks?.map(withMedia),
  })

  ipcMain.handle(IpcChannels.getTracks, async () => {
    library.reconcileMissingFiles()
    return library.list().map(withMedia)
  })

  ipcMain.handle(IpcChannels.deleteTrack, async (_event, id: string) => {
    library.delete(id, true)
    return library.list().map(withMedia)
  })

  ipcMain.handle(IpcChannels.openTrackFolder, async (_event, id: string) => {
    await library.openContainingFolder(id)
    return true
  })

  ipcMain.handle(IpcChannels.listAlbums, async () => {
    return library.listAlbums().map((album) => withAlbumMedia(album))
  })

  ipcMain.handle(IpcChannels.getAlbum, async (_event, id: string) => {
    return withAlbumMedia(library.getAlbum(id))
  })

  ipcMain.handle(IpcChannels.createAlbum, async (_event, name: string) => {
    return withAlbumMedia(library.createAlbum(name))
  })

  ipcMain.handle(IpcChannels.renameAlbum, async (_event, id: string, name: string) => {
    return withAlbumMedia(library.renameAlbum(id, name))
  })

  ipcMain.handle(IpcChannels.deleteAlbum, async (_event, id: string) => {
    library.deleteAlbum(id)
    return true
  })

  ipcMain.handle(
    IpcChannels.addTrackToAlbum,
    async (_event, albumId: string, trackId: string) => {
      return withAlbumMedia(library.addTrackToAlbum(albumId, trackId))
    },
  )

  ipcMain.handle(
    IpcChannels.removeTrackFromAlbum,
    async (_event, albumId: string, trackId: string) => {
      return withAlbumMedia(library.removeTrackFromAlbum(albumId, trackId))
    },
  )

  ipcMain.handle(IpcChannels.openPath, async (_event, targetPath: string) => {
    assertUnderMusicRoot(targetPath, settings.get().musicDirectory)
    const error = await shell.openPath(targetPath)
    if (error) throw new Error(error)
    return true
  })

  ipcMain.handle(IpcChannels.showItemInFolder, async (_event, targetPath: string) => {
    assertUnderMusicRoot(targetPath, settings.get().musicDirectory)
    shell.showItemInFolder(targetPath)
    return true
  })

  ipcMain.handle(IpcChannels.enqueueDownload, async (_event, input: EnqueueDownloadInput) => {
    return downloads.enqueue(input)
  })

  ipcMain.handle(IpcChannels.listDownloads, async () => downloads.list())

  ipcMain.handle(IpcChannels.clearDownloads, async () => downloads.clearHistory())

  ipcMain.handle(IpcChannels.cancelDownload, async (_event, id: string) => {
    return downloads.cancel(id)
  })

  ipcMain.handle(IpcChannels.retryDownload, async (_event, id: string) => {
    return downloads.retry(id)
  })

  downloads.onProgress((event) => {
    getWindow()?.webContents.send(IpcChannels.downloadProgress, event)
  })

  downloads.onLibraryChanged(() => {
    getWindow()?.webContents.send(IpcChannels.libraryChanged)
  })
}

function assertUnderMusicRoot(targetPath: string, musicRoot: string): void {
  if (!targetPath) throw new Error('Path is required.')
  const resolved = path.resolve(targetPath)
  const root = path.resolve(musicRoot)
  const relative = path.relative(root, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path is outside the music folder.')
  }
}
