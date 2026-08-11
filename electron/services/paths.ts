import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function getUserDataDir(): string {
  return app.getPath('userData')
}

/** OS Music folder (or ~/Music), discovered by Electron. */
export function getOsMusicDirectory(): string {
  try {
    return app.getPath('music')
  } catch {
    return path.join(os.homedir(), 'Music')
  }
}

/** App download folder: `<OS Music>/Sourney`, created on demand. */
export function getDefaultMusicDirectory(): string {
  return path.join(getOsMusicDirectory(), 'Sourney')
}

export function getDbPath(): string {
  return path.join(getUserDataDir(), 'sourney-library.sqlite')
}

export function getSettingsPath(): string {
  return path.join(getUserDataDir(), 'settings.json')
}

export function getDownloadsQueuePath(): string {
  return path.join(getUserDataDir(), 'downloads-queue.json')
}

export function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

export function sanitizeFilename(name: string, fallback = 'Unknown'): string {
  const cleaned = name
    .replace(INVALID_FILENAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')

  if (!cleaned) return fallback
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(cleaned)) {
    return `${cleaned}_`
  }
  return cleaned.slice(0, 180)
}

export function uniqueFilePath(targetPath: string): string {
  if (!fs.existsSync(targetPath)) return targetPath

  const dir = path.dirname(targetPath)
  const ext = path.extname(targetPath)
  const base = path.basename(targetPath, ext)
  let index = 1

  while (true) {
    const candidate = path.join(dir, `${base} (${index})${ext}`)
    if (!fs.existsSync(candidate)) return candidate
    index += 1
  }
}
