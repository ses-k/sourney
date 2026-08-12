import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { envWithBundledTools, getBundledFfmpegPath } from './bundledTools'

const MAX_EDGE = 512
const JPEG_QUALITY = 6

/**
 * Compress cover art for local offline storage (small JPEG sidecars).
 * Returns the optimized path, or the original path if ffmpeg is unavailable.
 */
export async function optimizeArtwork(
  sourcePath: string | null,
  preferredOutputPath: string,
): Promise<string | null> {
  if (!sourcePath || !fs.existsSync(sourcePath)) return null

  const outputPath = preferredOutputPath.toLowerCase().endsWith('.jpg')
    ? preferredOutputPath
    : `${preferredOutputPath.replace(/\.[^.]+$/, '')}.jpg`

  try {
    await runFfmpeg([
      '-y',
      '-i',
      sourcePath,
      '-vf',
      `scale='min(${MAX_EDGE},iw)':'min(${MAX_EDGE},ih)':force_original_aspect_ratio=decrease`,
      '-frames:v',
      '1',
      '-q:v',
      String(JPEG_QUALITY),
      outputPath,
    ])
  } catch {
    if (path.resolve(sourcePath) === path.resolve(outputPath)) return sourcePath
    try {
      fs.copyFileSync(sourcePath, outputPath)
    } catch {
      return sourcePath
    }
  }

  cleanupSiblingThumbnails(sourcePath, outputPath)
  return fs.existsSync(outputPath) ? outputPath : sourcePath
}

function cleanupSiblingThumbnails(sourcePath: string, keepPath: string): void {
  const dir = path.dirname(sourcePath)
  const keepResolved = path.resolve(keepPath)
  const base = path.basename(sourcePath, path.extname(sourcePath))
  const audioBase = path.basename(keepPath, path.extname(keepPath))

  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return
  }

  for (const name of names) {
    if (!/\.(jpg|jpeg|png|webp|bmp)$/i.test(name)) continue
    const full = path.join(dir, name)
    if (path.resolve(full) === keepResolved) continue

    const stem = path.basename(name, path.extname(name))
    const related =
      stem === base ||
      stem === audioBase ||
      stem.startsWith(`${base}.`) ||
      stem.startsWith(`${audioBase}.`)

    if (!related) continue
    try {
      fs.unlinkSync(full)
    } catch {
      // best-effort
    }
  }

  if (path.resolve(sourcePath) !== keepResolved && fs.existsSync(sourcePath)) {
    try {
      fs.unlinkSync(sourcePath)
    } catch {
      // best-effort
    }
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(getBundledFfmpegPath() ?? 'ffmpeg', args, {
      windowsHide: true,
      env: envWithBundledTools(),
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `ffmpeg exited with code ${code}`))
    })
  })
}
