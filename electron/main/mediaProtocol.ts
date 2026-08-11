import { protocol } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'

export const MEDIA_SCHEME = 'sourney-media'

const allowedRoots: string[] = []

export function setMediaAllowedRoots(roots: string[]): void {
  allowedRoots.length = 0
  for (const root of roots) {
    if (!root) continue
    allowedRoots.push(path.resolve(root))
  }
}

export function registerMediaSchemeAsPrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true,
      },
    },
  ])
}

export function registerMediaProtocolHandler(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const filePath = resolveMediaPath(request.url)
      if (!filePath || !fs.existsSync(filePath)) {
        return new Response('Not found', { status: 404 })
      }

      if (!isPathAllowed(filePath)) {
        return new Response('Forbidden', { status: 403 })
      }

      const stat = fs.statSync(filePath)
      if (!stat.isFile()) {
        return new Response('Not found', { status: 404 })
      }

      const fileSize = stat.size
      const mime = mimeFromPath(filePath)
      const rangeHeader = request.headers.get('Range') ?? request.headers.get('range')

      if (rangeHeader) {
        const parsed = parseByteRange(rangeHeader, fileSize)
        if (!parsed) {
          return new Response('Malformed Range', {
            status: 416,
            headers: {
              'Content-Range': `bytes */${fileSize}`,
            },
          })
        }

        const { start, end } = parsed
        const chunkSize = end - start + 1
        const stream = fs.createReadStream(filePath, { start, end })

        return new Response(Readable.toWeb(stream) as ReadableStream, {
          status: 206,
          headers: {
            'Content-Type': mime,
            'Content-Length': String(chunkSize),
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'no-cache',
          },
        })
      }

      const stream = fs.createReadStream(filePath)
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': mime,
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache',
        },
      })
    } catch (error) {
      console.error('[sourney] media protocol error:', error)
      return new Response('Internal error', { status: 500 })
    }
  })
}

export function toMediaUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const withLeading = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `${MEDIA_SCHEME}://local${encodeURI(withLeading)}`
}

function isPathAllowed(filePath: string): boolean {
  if (allowedRoots.length === 0) return true
  const resolved = path.resolve(filePath)
  return allowedRoots.some((root) => {
    const relative = path.relative(root, resolved)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  })
}

function resolveMediaPath(requestUrl: string): string | null {
  const url = new URL(requestUrl)
  let filePath = decodeURIComponent(url.pathname)
  if (process.platform === 'win32' && filePath.startsWith('/')) {
    filePath = filePath.slice(1)
  }
  return path.normalize(filePath)
}

function parseByteRange(
  header: string,
  fileSize: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || fileSize <= 0) return null

  const hasStart = match[1] !== ''
  const hasEnd = match[2] !== ''

  let start = hasStart ? Number(match[1]) : NaN
  let end = hasEnd ? Number(match[2]) : NaN

  if (!hasStart && hasEnd) {
    const suffix = Number(match[2])
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(fileSize - suffix, 0)
    end = fileSize - 1
  } else {
    if (!Number.isFinite(start)) return null
    if (!Number.isFinite(end) || end >= fileSize) end = fileSize - 1
  }

  if (start < 0 || end < start || start >= fileSize) return null
  return { start, end }
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
    case '.mp4':
      return 'audio/mp4'
    case '.opus':
      return 'audio/opus'
    case '.ogg':
      return 'audio/ogg'
    case '.flac':
      return 'audio/flac'
    case '.wav':
      return 'audio/wav'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}
