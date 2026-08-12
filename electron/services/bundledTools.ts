import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

const WIN_YTDLP = 'yt-dlp.exe'
const WIN_FFMPEG = 'ffmpeg.exe'
const WIN_FFPROBE = 'ffprobe.exe'

/** Directory with bundled yt-dlp / ffmpeg / ffprobe, or null if missing. */
export function getBundledToolsDir(): string | null {
  const candidates = [
    // Packaged app: electron-builder extraResources → resources/bin
    path.join(process.resourcesPath, 'bin'),
    // Dev / unpackaged: repo vendor/win
    path.join(process.cwd(), 'vendor', 'win'),
  ]

  try {
    candidates.push(path.join(app.getAppPath(), 'vendor', 'win'))
  } catch {
    // app may not be ready in some import orders
  }

  for (const dir of candidates) {
    if (!dir || !fs.existsSync(dir)) continue
    const ytdlp = path.join(dir, process.platform === 'win32' ? WIN_YTDLP : 'yt-dlp')
    if (fs.existsSync(ytdlp)) return dir
  }
  return null
}

export function getBundledYtDlpPath(): string | null {
  const dir = getBundledToolsDir()
  if (!dir) return null
  const file = path.join(dir, process.platform === 'win32' ? WIN_YTDLP : 'yt-dlp')
  return fs.existsSync(file) ? file : null
}

export function getBundledFfmpegPath(): string | null {
  const dir = getBundledToolsDir()
  if (!dir) return null
  const file = path.join(dir, process.platform === 'win32' ? WIN_FFMPEG : 'ffmpeg')
  return fs.existsSync(file) ? file : null
}

export function getBundledFfprobePath(): string | null {
  const dir = getBundledToolsDir()
  if (!dir) return null
  const file = path.join(dir, process.platform === 'win32' ? WIN_FFPROBE : 'ffprobe')
  return fs.existsSync(file) ? file : null
}

/** PATH with bundled tools first so child processes find ffmpeg/ffprobe. */
export function envWithBundledTools(): NodeJS.ProcessEnv {
  const dir = getBundledToolsDir()
  if (!dir) return { ...process.env }
  const current = process.env.PATH ?? ''
  return {
    ...process.env,
    PATH: `${dir}${path.delimiter}${current}`,
  }
}
