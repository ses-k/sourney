import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import type {
  DownloadItem,
  DownloadProgressEvent,
  EnqueueDownloadInput,
} from '../../shared/types'
import { LibraryService } from './LibraryService'
import { ensureDirectory, getDownloadsQueuePath, getUserDataDir } from './paths'
import { SettingsService } from './SettingsService'
import { YtDlpService } from './YtDlpService'

type ProgressListener = (event: DownloadProgressEvent) => void
type LibraryListener = () => void

const PERSIST_STATUSES = new Set(['pending', 'downloading'])

export class DownloadService {
  private readonly queue: DownloadItem[] = []
  private activeController: AbortController | null = null
  private processing = false
  private readonly progressListeners = new Set<ProgressListener>()
  private readonly libraryListeners = new Set<LibraryListener>()

  constructor(
    private readonly ytDlp: YtDlpService,
    private readonly settings: SettingsService,
    private readonly library: LibraryService,
  ) {
    this.restoreQueue()
  }

  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener)
    return () => this.progressListeners.delete(listener)
  }

  onLibraryChanged(listener: LibraryListener): () => void {
    this.libraryListeners.add(listener)
    return () => this.libraryListeners.delete(listener)
  }

  list(): DownloadItem[] {
    return this.queue.map((item) => ({ ...item }))
  }

  clearHistory(): DownloadItem[] {
    const kept = this.queue.filter(
      (item) => item.status === 'pending' || item.status === 'downloading',
    )
    this.queue.length = 0
    this.queue.push(...kept)
    this.persistQueue()
    return this.list()
  }

  enqueue(input: EnqueueDownloadInput): DownloadItem {
    if (!input.sourceUrl?.trim()) {
      throw new Error('Invalid URL.')
    }

    const sourceUrl = input.sourceUrl.trim()
    const existingTrack = this.library.getBySourceUrl(sourceUrl)
    if (existingTrack) {
      throw new Error('Already in your library.')
    }

    const inFlight = this.queue.find(
      (item) =>
        item.sourceUrl === sourceUrl &&
        (item.status === 'pending' || item.status === 'downloading'),
    )
    if (inFlight) {
      throw new Error('Already queued for download.')
    }

    const item: DownloadItem = {
      id: randomUUID(),
      title: input.title?.trim() || 'Unknown Title',
      artist: input.artist?.trim() || 'Unknown Artist',
      sourceUrl,
      thumbnailUrl: input.thumbnailUrl ?? null,
      duration: typeof input.duration === 'number' ? input.duration : null,
      status: 'pending',
      progress: 0,
      speed: null,
      statusText: 'Queued',
      error: null,
      filePath: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    this.queue.unshift(item)
    this.persistQueue()
    void this.processQueue()
    return { ...item }
  }

  cancel(id: string): DownloadItem {
    const item = this.requireItem(id)

    if (item.status === 'downloading' && this.activeController) {
      this.activeController.abort()
    }

    if (item.status === 'pending') {
      this.updateItem(id, {
        status: 'cancelled',
        error: 'Cancelled by user.',
        speed: null,
        statusText: 'Cancelled',
      })
    } else if (item.status === 'downloading') {
      // Files are cleaned in runDownload after the process aborts.
      this.updateItem(id, {
        status: 'cancelled',
        error: 'Cancelled by user.',
        speed: null,
        statusText: 'Cancelled',
      })
    }

    return { ...this.requireItem(id) }
  }

  retry(id: string): DownloadItem {
    const item = this.requireItem(id)
    if (item.status !== 'failed' && item.status !== 'cancelled') {
      throw new Error('Only failed or cancelled downloads can be retried.')
    }

    if (this.library.getBySourceUrl(item.sourceUrl)) {
      throw new Error('Already in your library.')
    }

    this.updateItem(id, {
      status: 'pending',
      progress: 0,
      speed: null,
      statusText: 'Queued',
      error: null,
      filePath: null,
    })

    void this.processQueue()
    return { ...this.requireItem(id) }
  }

  /** Resume any pending items restored from disk. */
  start(): void {
    void this.processQueue()
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return
    this.processing = true

    try {
      while (true) {
        const next = this.queue.find((item) => item.status === 'pending')
        if (!next) break
        await this.runDownload(next.id)
      }
    } finally {
      this.processing = false
      this.persistQueue()
    }
  }

  private async runDownload(id: string): Promise<void> {
    const item = this.requireItem(id)
    const controller = new AbortController()
    this.activeController = controller

    this.updateItem(id, {
      status: 'downloading',
      progress: 0,
      speed: null,
      statusText: 'Starting…',
      error: null,
    })

    try {
      const settings = this.settings.get()
      const musicDirectory = this.settings.assertMusicDirectory()

      const result = await this.ytDlp.download({
        url: item.sourceUrl,
        outputDirectory: musicDirectory,
        title: item.title,
        artist: item.artist,
        audioFormat: settings.audioFormat,
        audioQuality: settings.audioQuality,
        duration: item.duration,
        signal: controller.signal,
        onProgress: (progress, speed, statusText) => {
          const current = this.queue.find((entry) => entry.id === id)
          if (!current || current.status === 'cancelled') return
          this.updateItem(id, {
            status: 'downloading',
            progress,
            speed,
            statusText: statusText ?? current.statusText,
          })
        },
      })

      const current = this.queue.find((entry) => entry.id === id)
      if (!current || current.status === 'cancelled') {
        this.cleanupItemFiles(item)
        return
      }

      this.updateItem(id, {
        status: 'downloading',
        progress: 99,
        speed: null,
        statusText: 'Adding to library…',
      })

      await this.library.addFromDownload({
        title: result.title,
        artist: result.artist,
        album: result.album,
        duration: result.duration,
        filePath: result.filePath,
        artworkPath: result.artworkPath,
        sourceUrl: item.sourceUrl,
      })

      this.updateItem(id, {
        status: 'completed',
        progress: 100,
        speed: null,
        statusText: 'Completed',
        error: null,
        filePath: result.filePath,
      })

      for (const listener of this.libraryListeners) listener()
    } catch (error) {
      const current = this.queue.find((entry) => entry.id === id)
      if (!current) return

      this.cleanupItemFiles(item)

      if (current.status === 'cancelled' || controller.signal.aborted) {
        this.updateItem(id, {
          status: 'cancelled',
          error: 'Cancelled by user.',
          speed: null,
          statusText: 'Cancelled',
        })
        return
      }

      const message = error instanceof Error ? error.message : 'Download failed.'
      this.updateItem(id, {
        status: 'failed',
        error: message,
        speed: null,
        statusText: 'Failed',
      })
    } finally {
      if (this.activeController === controller) {
        this.activeController = null
      }
      this.persistQueue()
    }
  }

  private cleanupItemFiles(item: DownloadItem): void {
    try {
      const musicDirectory = this.settings.get().musicDirectory
      this.ytDlp.cleanupResiduals(musicDirectory, item.artist, item.title)
    } catch {
      // best-effort
    }
  }

  private requireItem(id: string): DownloadItem {
    const item = this.queue.find((entry) => entry.id === id)
    if (!item) throw new Error('Download item not found.')
    return item
  }

  private updateItem(id: string, patch: Partial<DownloadItem>): void {
    const index = this.queue.findIndex((entry) => entry.id === id)
    if (index < 0) return

    const updated: DownloadItem = {
      ...this.queue[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    }
    this.queue[index] = updated

    const event: DownloadProgressEvent = {
      id: updated.id,
      sourceUrl: updated.sourceUrl,
      progress: updated.progress,
      speed: updated.speed,
      statusText: updated.statusText,
      status: updated.status,
      error: updated.error,
      filePath: updated.filePath,
    }

    for (const listener of this.progressListeners) listener(event)
    if (PERSIST_STATUSES.has(updated.status) || patch.status) {
      this.persistQueue()
    }
  }

  private restoreQueue(): void {
    try {
      ensureDirectory(getUserDataDir())
      const file = getDownloadsQueuePath()
      if (!fs.existsSync(file)) return
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as DownloadItem[]
      if (!Array.isArray(raw)) return

      for (const item of raw) {
        if (!item?.id || !item.sourceUrl) continue
        if (item.status === 'downloading') {
          item.status = 'pending'
          item.progress = 0
          item.speed = null
          item.statusText = 'Queued'
        }
        if (item.status === 'pending') {
          this.queue.push(item)
        }
      }
    } catch {
      // ignore corrupt queue file
    }
  }

  private persistQueue(): void {
    try {
      ensureDirectory(getUserDataDir())
      const pending = this.queue.filter((item) => PERSIST_STATUSES.has(item.status))
      fs.writeFileSync(getDownloadsQueuePath(), JSON.stringify(pending, null, 2), 'utf8')
    } catch {
      // best-effort
    }
  }
}
