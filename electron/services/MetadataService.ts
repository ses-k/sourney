import { spawn } from 'node:child_process'
import fs from 'node:fs'
import type { Track } from '../../shared/types'
import { envWithBundledTools, getBundledFfprobePath } from './bundledTools'

export class MetadataService {
  normalizeTrackInput(input: {
    id: string
    title?: string | null
    artist?: string | null
    album?: string | null
    duration?: number | null
    filePath: string
    artworkPath?: string | null
    sourceUrl?: string | null
    createdAt?: string
  }): Track {
    return {
      id: input.id,
      title: (input.title ?? '').trim() || 'Unknown Title',
      artist: (input.artist ?? '').trim() || 'Unknown Artist',
      album: input.album?.trim() ? input.album.trim() : null,
      duration:
        typeof input.duration === 'number' && Number.isFinite(input.duration)
          ? input.duration
          : null,
      filePath: input.filePath,
      artworkPath: input.artworkPath ?? null,
      sourceUrl: input.sourceUrl ?? null,
      createdAt: input.createdAt ?? new Date().toISOString(),
    }
  }

  async enrichDuration(filePath: string, fallback: number | null): Promise<number | null> {
    if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
      return fallback
    }
    if (!filePath || !fs.existsSync(filePath)) return fallback

    try {
      const probed = await probeDurationSeconds(filePath)
      return probed ?? fallback
    } catch {
      return fallback
    }
  }
}

function probeDurationSeconds(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const child = spawn(
      getBundledFfprobePath() ?? 'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { windowsHide: true, env: envWithBundledTools(), stdio: ['ignore', 'pipe', 'ignore'] },
    )

    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })

    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      const value = Number.parseFloat(stdout.trim())
      resolve(Number.isFinite(value) && value > 0 ? value : null)
    })
  })
}
