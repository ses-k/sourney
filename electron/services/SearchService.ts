import { randomUUID } from 'node:crypto'
import type { SearchResult } from '../../shared/types'
import { YtDlpService } from './YtDlpService'

const SEARCH_LIMIT = 6
const CACHE_TTL_MS = 5 * 60_000
const CACHE_MAX = 40

interface CacheEntry {
  results: SearchResult[]
  expiresAt: number
}

export class SearchService {
  private activeController: AbortController | null = null
  private activeRequestId: string | null = null
  private readonly cache = new Map<string, CacheEntry>()

  constructor(private readonly ytDlp: YtDlpService) {}

  async search(query: string): Promise<SearchResult[]> {
    const trimmed = query.trim()
    if (!trimmed) {
      throw new Error('Enter a song title or artist to search.')
    }

    const cached = this.getCached(trimmed)
    if (cached) return cached

    try {
      const results = await this.ytDlp.search(trimmed, SEARCH_LIMIT)
      if (results.length === 0) {
        throw new Error('No search results found. Try a different query.')
      }
      this.setCached(trimmed, results)
      return results
    } catch (error) {
      throw this.normalizeError(error)
    }
  }

  startStream(
    query: string,
    handlers: {
      onResult: (requestId: string, result: SearchResult) => void
      onDone: (requestId: string, count: number) => void
      onError: (requestId: string, message: string) => void
    },
  ): string {
    const trimmed = query.trim()
    if (!trimmed) {
      throw new Error('Enter a song title or artist to search.')
    }

    this.cancel()

    const requestId = randomUUID()
    const controller = new AbortController()
    this.activeController = controller
    this.activeRequestId = requestId

    const cached = this.getCached(trimmed)
    if (cached && cached.length > 0) {
      queueMicrotask(() => {
        if (this.activeRequestId !== requestId) return
        for (const result of cached) {
          handlers.onResult(requestId, result)
        }
        handlers.onDone(requestId, cached.length)
        if (this.activeRequestId === requestId) {
          this.activeController = null
          this.activeRequestId = null
        }
      })
      return requestId
    }

    void this.runStream(requestId, trimmed, controller, handlers)
    return requestId
  }

  cancel(requestId?: string): void {
    if (requestId && this.activeRequestId && requestId !== this.activeRequestId) {
      return
    }
    this.activeController?.abort()
    this.activeController = null
    this.activeRequestId = null
  }

  private async runStream(
    requestId: string,
    query: string,
    controller: AbortController,
    handlers: {
      onResult: (requestId: string, result: SearchResult) => void
      onDone: (requestId: string, count: number) => void
      onError: (requestId: string, message: string) => void
    },
  ): Promise<void> {
    const collected: SearchResult[] = []

    try {
      const count = await this.ytDlp.searchStream(query, SEARCH_LIMIT, {
        signal: controller.signal,
        onResult: (result) => {
          if (this.activeRequestId !== requestId) return
          collected.push(result)
          handlers.onResult(requestId, result)
        },
      })

      if (this.activeRequestId !== requestId) return

      if (count === 0) {
        handlers.onError(requestId, 'No search results found. Try a different query.')
      } else {
        this.setCached(query, collected)
        handlers.onDone(requestId, count)
      }
    } catch (error) {
      if (this.activeRequestId !== requestId) return
      const message = error instanceof Error ? error.message : 'Search failed.'
      if (/cancelled/i.test(message)) return
      handlers.onError(requestId, this.normalizeError(error).message)
    } finally {
      if (this.activeRequestId === requestId) {
        this.activeController = null
        this.activeRequestId = null
      }
    }
  }

  private getCached(query: string): SearchResult[] | null {
    const key = query.toLowerCase()
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    // Refresh LRU order
    this.cache.delete(key)
    this.cache.set(key, entry)
    return entry.results.map((result) => ({ ...result }))
  }

  private setCached(query: string, results: SearchResult[]): void {
    const key = query.toLowerCase()
    this.cache.set(key, {
      results: results.map((result) => ({ ...result })),
      expiresAt: Date.now() + CACHE_TTL_MS,
    })

    while (this.cache.size > CACHE_MAX) {
      const oldest = this.cache.keys().next().value
      if (oldest == null) break
      this.cache.delete(oldest)
    }
  }

  private normalizeError(error: unknown): Error {
    const message = error instanceof Error ? error.message : 'Search failed.'
    if (/timed out|network|ENOTFOUND|ECONN/i.test(message)) {
      return new Error('Network failure during search. Check your connection and try again.')
    }
    return error instanceof Error ? error : new Error(message)
  }
}
