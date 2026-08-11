import fs from 'node:fs'
import type { AppSettings, AudioFormat, AudioQuality } from '../../shared/types'
import { ensureDirectory, getDefaultMusicDirectory, getSettingsPath, getUserDataDir } from './paths'

const VALID_FORMATS: AudioFormat[] = ['mp3', 'm4a', 'opus', 'flac', 'wav']
const VALID_QUALITIES: AudioQuality[] = ['best', 'high', 'medium', 'low']

export class SettingsService {
  private settings: AppSettings

  constructor() {
    ensureDirectory(getUserDataDir())
    this.settings = this.load()
    this.settings.musicDirectory = this.resolveMusicDirectory(this.settings.musicDirectory)
    this.persist(this.settings)
  }

  get(): AppSettings {
    return { ...this.settings }
  }

  save(partial: Partial<AppSettings>): AppSettings {
    const requestedDir = partial.musicDirectory?.trim()
    const musicDirectory =
      requestedDir === undefined
        ? this.settings.musicDirectory
        : requestedDir === '' || requestedDir === '__default__'
          ? getDefaultMusicDirectory()
          : requestedDir

    const next: AppSettings = {
      musicDirectory: this.resolveMusicDirectory(musicDirectory),
      audioFormat: this.normalizeFormat(partial.audioFormat ?? this.settings.audioFormat),
      audioQuality: this.normalizeQuality(partial.audioQuality ?? this.settings.audioQuality),
    }

    this.settings = next
    this.persist(this.settings)
    return this.get()
  }

  assertMusicDirectory(): string {
    const dir = this.resolveMusicDirectory(this.settings.musicDirectory)
    if (dir !== this.settings.musicDirectory) {
      this.settings = { ...this.settings, musicDirectory: dir }
      this.persist(this.settings)
    }
    return dir
  }

  /** Create the folder if needed; fall back to Music/Sourney when the path is invalid. */
  private resolveMusicDirectory(dir: string): string {
    const candidates = [dir?.trim(), getDefaultMusicDirectory()].filter(Boolean) as string[]

    for (const candidate of candidates) {
      try {
        ensureDirectory(candidate)
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
          return candidate
        }
      } catch {
        // try next candidate
      }
    }

    const fallback = getDefaultMusicDirectory()
    ensureDirectory(fallback)
    return fallback
  }

  private load(): AppSettings {
    const defaults: AppSettings = {
      musicDirectory: getDefaultMusicDirectory(),
      audioFormat: 'opus',
      audioQuality: 'medium',
    }

    try {
      if (!fs.existsSync(getSettingsPath())) {
        return defaults
      }

      const raw = JSON.parse(fs.readFileSync(getSettingsPath(), 'utf8')) as Partial<AppSettings>
      return {
        musicDirectory: raw.musicDirectory?.trim() || defaults.musicDirectory,
        audioFormat: this.normalizeFormat(raw.audioFormat ?? defaults.audioFormat),
        audioQuality: this.normalizeQuality(raw.audioQuality ?? defaults.audioQuality),
      }
    } catch {
      return defaults
    }
  }

  private persist(settings: AppSettings): void {
    fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf8')
  }

  private normalizeFormat(value: string): AudioFormat {
    return VALID_FORMATS.includes(value as AudioFormat) ? (value as AudioFormat) : 'opus'
  }

  private normalizeQuality(value: string): AudioQuality {
    return VALID_QUALITIES.includes(value as AudioQuality) ? (value as AudioQuality) : 'medium'
  }
}
