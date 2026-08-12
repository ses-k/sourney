import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AudioFormat, AudioQuality, SearchResult } from '../../shared/types'
import { optimizeArtwork } from './ArtworkOptimizer'
import {
  envWithBundledTools,
  getBundledFfmpegPath,
  getBundledToolsDir,
  getBundledYtDlpPath,
} from './bundledTools'
import { sanitizeFilename, uniqueFilePath } from './paths'

export interface YtDlpDownloadOptions {
  url: string
  outputDirectory: string
  title: string
  artist: string
  audioFormat: AudioFormat
  audioQuality: AudioQuality
  duration?: number | null
  onProgress?: (progress: number, speed: string | null, statusText?: string | null) => void
  signal?: AbortSignal
}

export interface YtDlpDownloadResult {
  filePath: string
  artworkPath: string | null
  title: string
  artist: string
  album: string | null
  duration: number | null
}

type JsonRecord = Record<string, unknown>

export class YtDlpService {
  private binary: string | null = null
  private usePythonModule = false

  async ensureAvailable(): Promise<void> {
    if (this.binary || this.usePythonModule) return

    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
    const candidates = [
      process.env.YTDLP_PATH,
      getBundledYtDlpPath(),
      'yt-dlp',
      'yt-dlp.exe',
      path.join(localAppData, 'Microsoft', 'WindowsApps', 'yt-dlp.exe'),
      path.join(localAppData, 'Python', 'pythoncore-3.13-64', 'Scripts', 'yt-dlp.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
      path.join(localAppData, 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
    ].filter(Boolean) as string[]

    for (const candidate of candidates) {
      if (await this.canRun(candidate, ['--version'])) {
        this.binary = candidate
        this.usePythonModule = false
        return
      }
    }

    if (await this.canRun('python', ['-m', 'yt_dlp', '--version'])) {
      this.usePythonModule = true
      this.binary = 'python'
      return
    }

    if (await this.canRun('py', ['-m', 'yt_dlp', '--version'])) {
      this.usePythonModule = true
      this.binary = 'py'
      return
    }

    throw new Error(
      'yt-dlp was not found. Reinstall Sourney, or install yt-dlp and ensure it is on PATH (or set YTDLP_PATH).',
    )
  }

  async checkTools(): Promise<{ ytDlp: boolean; ffmpeg: boolean; message: string }> {
    let ytDlp = false
    try {
      await this.ensureAvailable()
      ytDlp = true
    } catch {
      ytDlp = false
    }

    const ffmpegBin = getBundledFfmpegPath() ?? 'ffmpeg'
    const ffmpeg = await this.canRun(ffmpegBin, ['-version'])

    let message = 'Ready'
    if (ytDlp && ffmpeg && getBundledToolsDir()) {
      message = 'Ready (bundled yt-dlp + ffmpeg)'
    } else if (!ytDlp && !ffmpeg) {
      message = 'yt-dlp and ffmpeg are missing.'
    } else if (!ytDlp) {
      message = 'yt-dlp was not found.'
    } else if (!ffmpeg) {
      message = 'ffmpeg was not found (needed for audio conversion and covers).'
    }

    return { ytDlp, ffmpeg, message }
  }

  /** Remove incomplete audio/thumb leftovers for a cancelled or failed download. */
  cleanupResiduals(outputDirectory: string, artist: string, title: string): void {
    const artistFolder = sanitizeFilename(artist || 'Unknown Artist', 'Unknown Artist')
    const titleName = sanitizeFilename(title || 'Unknown Title', 'Unknown Title')
    const targetDir = path.join(outputDirectory, artistFolder)
    if (!fs.existsSync(targetDir)) return

    let names: string[]
    try {
      names = fs.readdirSync(targetDir)
    } catch {
      return
    }

    const titleLower = titleName.toLowerCase()
    for (const name of names) {
      const stem = path.basename(name, path.extname(name)).toLowerCase()
      const isPart = /\.part$/i.test(name) || /\.ytdl$/i.test(name)
      const matchesTitle =
        stem === titleLower ||
        stem.startsWith(`${titleLower}.`) ||
        stem.startsWith(`${titleLower} (`)

      if (!isPart && !matchesTitle) continue
      // Keep completed library files; only wipe obvious temps / matching incomplete sidecars
      // when the download did not finish. Callers invoke this only on cancel/fail.
      if (!isPart && /\.(mp3|m4a|opus|flac|wav)$/i.test(name)) {
        // Incomplete extracts sometimes leave tiny files; remove matching audio on fail/cancel.
        try {
          const full = path.join(targetDir, name)
          const size = fs.statSync(full).size
          if (size > 256_000) continue
        } catch {
          continue
        }
      }

      try {
        fs.unlinkSync(path.join(targetDir, name))
      } catch {
        // best-effort
      }
    }

    try {
      if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length === 0) {
        fs.rmdirSync(targetDir)
      }
    } catch {
      // best-effort
    }
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const results: SearchResult[] = []
    await this.searchStream(query, limit, {
      onResult: (result) => {
        results.push(result)
      },
    })
    return results
  }

  async searchStream(
    query: string,
    limit: number,
    options: {
      onResult: (result: SearchResult) => void
      signal?: AbortSignal
    },
  ): Promise<number> {
    const trimmed = query.trim()
    if (!trimmed) return 0

    await this.ensureAvailable()

    // Keep the limit modest — fewer YouTube page fetches means earlier first hits.
    const safeLimit = Math.max(1, Math.min(limit, 8))
    const args = [
      `ytsearch${safeLimit}:${trimmed}`,
      '--flat-playlist',
      '--lazy-playlist',
      '--dump-json',
      '--no-download',
      '--skip-download',
      '--no-warnings',
      '--ignore-errors',
      '--no-check-certificates',
      '--socket-timeout',
      '8',
      // Avoid extra YouTube auth/page work during search.
      '--extractor-args',
      'youtubetab:skip=authcheck',
    ]

    let count = 0
    let sawOutput = false

    const { stderr, code } = await this.run(args, {
      timeoutMs: 45_000,
      signal: options.signal,
      onStdoutLine: (line) => {
        if (options.signal?.aborted) return
        const result = parseSearchLine(line)
        if (!result) return
        sawOutput = true
        count += 1
        options.onResult(result)
      },
    })

    if (options.signal?.aborted) {
      throw new Error('Search cancelled.')
    }

    if (code !== 0 && !sawOutput) {
      throw new Error(this.friendlyError(stderr, 'Search failed. Check your network connection.'))
    }

    return count
  }

  async getMetadata(url: string): Promise<JsonRecord> {
    await this.ensureAvailable()
    if (!isProbablyUrl(url)) {
      throw new Error('Invalid URL.')
    }

    const { stdout, stderr, code } = await this.run(
      [url, '--dump-json', '--no-download', '--no-warnings'],
      { timeoutMs: 45_000 },
    )

    if (code !== 0 || !stdout.trim()) {
      throw new Error(this.friendlyError(stderr, 'Failed to fetch metadata for URL.'))
    }

    return JSON.parse(stdout.split(/\r?\n/).find((line) => line.trim()) ?? '{}') as JsonRecord
  }

  async download(options: YtDlpDownloadOptions): Promise<YtDlpDownloadResult> {
    await this.ensureAvailable()

    if (!isProbablyUrl(options.url)) {
      throw new Error('Invalid URL.')
    }

    if (!fs.existsSync(options.outputDirectory)) {
      throw new Error(`Download directory does not exist: ${options.outputDirectory}`)
    }

    const artistFolder = sanitizeFilename(options.artist || 'Unknown Artist', 'Unknown Artist')
    const titleName = sanitizeFilename(options.title || 'Unknown Title', 'Unknown Title')
    const targetDir = path.join(options.outputDirectory, artistFolder)
    fs.mkdirSync(targetDir, { recursive: true })

    const targetPath = uniqueFilePath(path.join(targetDir, `${titleName}.${options.audioFormat}`))
    const outputTemplate = targetPath.replace(/\.[^.]+$/, '.%(ext)s')

    // Sidecar covers (compressed later) instead of embedding — avoids duplicating
    // large artwork inside every audio file (Spotify-style offline storage).
    const ffmpegLocation = getBundledToolsDir() ?? getBundledFfmpegPath()
    const args = [
      options.url,
      '-x',
      '--audio-format',
      options.audioFormat,
      ...audioQualityArgs(options.audioFormat, options.audioQuality),
      // Prefer already-compressed sources when possible; force stereo to cut size.
      '-f',
      preferredFormatSelector(options.audioFormat),
      '--postprocessor-args',
      'ExtractAudio:-ac 2',
      '--add-metadata',
      '--write-thumbnail',
      '--convert-thumbnails',
      'jpg',
      '--no-playlist',
      '--newline',
      '--no-warnings',
      ...(ffmpegLocation ? ['--ffmpeg-location', ffmpegLocation] : []),
      '-o',
      outputTemplate,
    ]

    let lastProgress = 0
    let lastSpeed: string | null = null
    let lastStatus: string | null = 'Starting download…'

    const report = (progress: number, speed: string | null, statusText: string | null) => {
      lastProgress = Math.max(lastProgress, Math.min(99, progress))
      lastSpeed = speed
      lastStatus = statusText
      options.onProgress?.(lastProgress, lastSpeed, lastStatus)
    }

    report(1, null, 'Starting download…')

    const handleLine = (line: string) => {
      const phase = parsePostProcessLine(line)
      if (phase) {
        report(phase.progress, null, phase.statusText)
        return
      }

      const parsed = parseProgressLine(line)
      if (!parsed) return
      // Leave headroom for extract/embed steps so the bar doesn't sit at 99%.
      const mapped = Math.min(88, Math.round(parsed.progress * 0.88))
      report(mapped, parsed.speed, 'Downloading…')
    }

    const { code, stderr } = await this.run(args, {
      timeoutMs: 30 * 60_000,
      signal: options.signal,
      onStdoutLine: handleLine,
      onStderrLine: handleLine,
    })

    if (options.signal?.aborted) {
      throw new Error('Download cancelled.')
    }

    if (code !== 0) {
      throw new Error(this.friendlyError(stderr, 'Download failed.'))
    }

    report(96, null, 'Saving file…')

    const filePath = findDownloadedFile(targetDir, titleName, options.audioFormat, targetPath)
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Download finished but the audio file was not found.')
    }

    report(98, null, 'Compressing artwork…')
    const rawArtwork = findArtwork(filePath)
    const artworkPath = await optimizeArtwork(
      rawArtwork,
      path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}.jpg`),
    )
    report(99, null, 'Almost done…')

    return {
      filePath,
      artworkPath,
      title: options.title || 'Unknown Title',
      artist: options.artist || 'Unknown Artist',
      album: null,
      duration: typeof options.duration === 'number' ? options.duration : null,
    }
  }

  private async canRun(command: string, args: string[]): Promise<boolean> {
    try {
      const result = await this.spawnOnce(command, args, { timeoutMs: 8_000 })
      return result.code === 0
    } catch {
      return false
    }
  }

  private async run(
    args: string[],
    options: {
      timeoutMs?: number
      signal?: AbortSignal
      onStdoutLine?: (line: string) => void
      onStderrLine?: (line: string) => void
    } = {},
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    await this.ensureAvailable()
    const command = this.binary!
    const fullArgs = this.usePythonModule ? ['-m', 'yt_dlp', ...args] : args
    return this.spawnOnce(command, fullArgs, options)
  }

  private spawnOnce(
    command: string,
    args: string[],
    options: {
      timeoutMs?: number
      signal?: AbortSignal
      onStdoutLine?: (line: string) => void
      onStderrLine?: (line: string) => void
    } = {},
  ): Promise<{ stdout: string; stderr: string; code: number | null }> {
    return new Promise((resolve, reject) => {
      let child: ChildProcessWithoutNullStreams
      try {
        child = spawn(command, args, {
          windowsHide: true,
          env: {
            ...envWithBundledTools(),
            // Stream yt-dlp JSON lines immediately when launched via python -m
            PYTHONUNBUFFERED: '1',
            PYTHONIOENCODING: 'utf-8',
          },
        })
      } catch (error) {
        reject(error)
        return
      }

      let stdout = ''
      let stderr = ''
      let settled = false
      let stdoutBuffer = ''
      let stderrBuffer = ''

      const finish = (code: number | null, error?: Error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
        if (error) reject(error)
        else resolve({ stdout, stderr, code })
      }

      const onAbort = () => {
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 1500)
        finish(null, new Error('Download cancelled.'))
      }

      if (options.signal) {
        if (options.signal.aborted) {
          onAbort()
          return
        }
        options.signal.addEventListener('abort', onAbort, { once: true })
      }

      const timer = setTimeout(() => {
        child.kill('SIGTERM')
        finish(null, new Error('yt-dlp timed out.'))
      }, options.timeoutMs ?? 60_000)

      const flushLines = (
        chunk: Buffer,
        buffer: { value: string },
        sink: (line: string) => void,
        onLine?: (line: string) => void,
      ) => {
        const text = chunk.toString('utf8')
        sink(text)
        if (!onLine) return
        buffer.value += text
        const lines = buffer.value.split(/\r?\n/)
        buffer.value = lines.pop() ?? ''
        for (const line of lines) onLine(line)
      }

      const stdoutState = { value: '' }
      const stderrState = { value: '' }

      child.stdout.on('data', (chunk: Buffer) => {
        flushLines(chunk, stdoutState, (text) => {
          stdout += text
        }, options.onStdoutLine)
        stdoutBuffer = stdoutState.value
      })

      child.stderr.on('data', (chunk: Buffer) => {
        flushLines(chunk, stderrState, (text) => {
          stderr += text
        }, options.onStderrLine)
        stderrBuffer = stderrState.value
      })

      child.on('error', (error) => finish(null, error))
      child.on('close', (code) => finish(code))

      void stdoutBuffer
      void stderrBuffer
    })
  }

  private friendlyError(stderr: string, fallback: string): string {
    const text = stderr.trim()
    if (!text) return fallback
    if (/ENOSPC|No space left/i.test(text)) {
      return 'Insufficient disk space to complete the download.'
    }
    if (/network|Unable to download|urlopen|timed out|Temporary failure/i.test(text)) {
      return 'Network failure while contacting the source. Check your connection and retry.'
    }
    if (/Unsupported URL|is not a valid URL/i.test(text)) {
      return 'Invalid or unsupported URL.'
    }
    const firstLine = text.split(/\r?\n/).find((line) => line.trim())
    return firstLine ? `${fallback} ${firstLine}` : fallback
  }
}

function preferredFormatSelector(format: AudioFormat): string {
  // Prefer sources that already match the target codec so we avoid oversized intermediates.
  if (format === 'opus') return 'ba[acodec^=opus]/ba/b'
  if (format === 'm4a') return 'ba[acodec^=mp4a]/ba/b'
  return 'ba/b'
}

function audioQualityArgs(format: AudioFormat, quality: AudioQuality): string[] {
  if (format === 'flac' || format === 'wav') return []
  return ['--audio-quality', mapBitrate(format, quality)]
}

/** Target bitrates tuned for offline listening with small footprints. */
function mapBitrate(format: AudioFormat, quality: AudioQuality): string {
  const tables: Record<'opus' | 'm4a' | 'mp3', Record<AudioQuality, string>> = {
    // Opus is ~30–50% smaller than MP3 at similar perceived quality.
    opus: { best: '160K', high: '128K', medium: '96K', low: '64K' },
    m4a: { best: '192K', high: '160K', medium: '128K', low: '96K' },
    mp3: { best: '192K', high: '160K', medium: '128K', low: '96K' },
  }

  if (format === 'opus' || format === 'm4a' || format === 'mp3') {
    return tables[format][quality]
  }

  return '128K'
}

function parseProgressLine(line: string): { progress: number; speed: string | null } | null {
  // Example: [download]  45.2% of 3.50MiB at 1.20MiB/s ETA 00:03
  const match = line.match(
    /\[download\]\s+(\d+(?:\.\d+)?)%.*?at\s+([^\s]+(?:\s*\/s)?)(?:\s+ETA|$)/i,
  )
  if (!match) {
    const simple = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
    if (!simple) return null
    return { progress: Math.min(100, Number(simple[1])), speed: null }
  }

  return {
    progress: Math.min(100, Number(match[1])),
    speed: match[2] ?? null,
  }
}

function parsePostProcessLine(
  line: string,
): { progress: number; statusText: string } | null {
  if (/\[ExtractAudio\]/i.test(line) || /Destination:.*\.(mp3|m4a|opus|flac|wav)/i.test(line)) {
    return { progress: 92, statusText: 'Extracting audio…' }
  }
  if (/\[ThumbnailsConvertor\]|Writing thumbnail|Downloading .* thumbnail/i.test(line)) {
    return { progress: 95, statusText: 'Saving artwork…' }
  }
  if (/\[Metadata\]|Adding metadata/i.test(line)) {
    return { progress: 97, statusText: 'Writing metadata…' }
  }
  if (/\[Fixup|Deleting original/i.test(line)) {
    return { progress: 98, statusText: 'Finalizing…' }
  }
  return null
}

function parseSearchLine(line: string): SearchResult | null {
  if (!line.trim()) return null
  try {
    const item = JSON.parse(line) as JsonRecord
    const id = String(item.id ?? item.url ?? cryptoRandomId())
    const title = String(item.title ?? 'Unknown Title')
    const uploader = item.uploader == null ? null : String(item.uploader)
    const channel = item.channel == null ? null : String(item.channel)
    const artist = uploader || channel || 'Unknown Artist'
    const sourceUrl =
      typeof item.webpage_url === 'string'
        ? item.webpage_url
        : typeof item.url === 'string' && item.url.startsWith('http')
          ? item.url
          : `https://www.youtube.com/watch?v=${id}`

    // Prefer compact CDN thumbs — smaller than maxres/hq before local compression.
    const thumbnailUrl =
      /^[\w-]{6,}$/.test(id) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : pickThumbnail(item)

    return {
      id,
      title,
      artist,
      uploader: uploader || channel,
      duration: typeof item.duration === 'number' ? item.duration : null,
      thumbnailUrl,
      sourceUrl,
    }
  } catch {
    return null
  }
}

function pickThumbnail(item: JsonRecord): string | null {
  if (typeof item.thumbnail === 'string') return item.thumbnail
  const thumbnails = item.thumbnails
  if (Array.isArray(thumbnails) && thumbnails.length > 0) {
    const last = thumbnails[thumbnails.length - 1] as JsonRecord
    if (typeof last.url === 'string') return last.url
  }
  return null
}

function isProbablyUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function findDownloadedFile(
  dir: string,
  titleName: string,
  format: AudioFormat,
  preferredPath: string,
): string | null {
  if (fs.existsSync(preferredPath)) return preferredPath

  const entries = fs.readdirSync(dir)
  const exact = entries.find(
    (name) =>
      name.toLowerCase() === `${titleName}.${format}`.toLowerCase() ||
      name.toLowerCase().startsWith(`${titleName.toLowerCase()} (`),
  )
  if (exact) return path.join(dir, exact)

  const byExt = entries
    .filter((name) => name.toLowerCase().endsWith(`.${format}`))
    .map((name) => ({
      name,
      mtime: fs.statSync(path.join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)

  return byExt[0] ? path.join(dir, byExt[0].name) : null
}

function findArtwork(audioPath: string): string | null {
  const dir = path.dirname(audioPath)
  const base = path.basename(audioPath, path.extname(audioPath))
  const candidates = ['.jpg', '.jpeg', '.png', '.webp'].map((ext) => path.join(dir, `${base}${ext}`))

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  // Only accept same-stem variants (e.g. "Song.webp") — never "newest in folder".
  try {
    const related = fs
      .readdirSync(dir)
      .filter((name) => {
        if (!/\.(jpg|jpeg|png|webp)$/i.test(name)) return false
        const stem = path.basename(name, path.extname(name))
        return stem === base || stem.startsWith(`${base}.`)
      })
      .map((name) => path.join(dir, name))

    return related[0] ?? null
  } catch {
    return null
  }
}

function cryptoRandomId(): string {
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
