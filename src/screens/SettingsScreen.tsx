import { useEffect, useState } from 'react'
import type { AppSettings, AudioFormat, AudioQuality, ToolStatus } from '../../shared/types'
import { getApi } from '../api/client'
import { formatError } from '../lib/format'

const FORMATS: { value: AudioFormat; label: string }[] = [
  { value: 'opus', label: 'Opus — smallest (recommended)' },
  { value: 'm4a', label: 'M4A / AAC — small, widely compatible' },
  { value: 'mp3', label: 'MP3 — compatible, larger' },
  { value: 'flac', label: 'FLAC — lossless, much larger' },
  { value: 'wav', label: 'WAV — uncompressed, largest' },
]

const QUALITIES: { value: AudioQuality; label: string }[] = [
  { value: 'low', label: 'Low — ~64–96 kbps, least space' },
  { value: 'medium', label: 'Medium — ~96–128 kbps (recommended)' },
  { value: 'high', label: 'High — ~128–160 kbps' },
  { value: 'best', label: 'Best — ~160–192 kbps' },
]

const LOSSLESS = new Set<AudioFormat>(['flac', 'wav'])

export function SettingsScreen() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [tools, setTools] = useState<ToolStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void getApi()
      .getSettings()
      .then(setSettings)
      .catch((err) => setError(formatError(err, 'Could not load settings.')))

    void getApi()
      .getToolStatus()
      .then(setTools)
      .catch(() => setTools({ ytDlp: false, ffmpeg: false, message: 'Could not check tools.' }))
  }, [])

  const apply = async (partial: Partial<AppSettings>) => {
    setError(null)
    try {
      const saved = await getApi().saveSettings(partial)
      setSettings(saved)
    } catch (err) {
      setError(formatError(err, 'Could not update settings.'))
    }
  }

  const onBrowse = async () => {
    setError(null)
    try {
      const next = await getApi().pickMusicDirectory()
      setSettings(next)
    } catch (err) {
      setError(formatError(err, 'Could not pick directory.'))
    }
  }

  if (!settings) {
    return <p className="text-sm text-[#b3b3b3]">Loading settings…</p>
  }

  const lossless = LOSSLESS.has(settings.audioFormat)

  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Settings</h1>
        <p className="text-sm text-[#b3b3b3]">Changes apply immediately. Stored only on this computer.</p>
      </header>

      {error && <p className="banner-error">{error}</p>}

      {tools && (
        <p className={tools.ytDlp && tools.ffmpeg ? 'banner-ok' : 'banner-error'}>
          Tools: {tools.message}
          {tools.ytDlp ? ' · yt-dlp ✓' : ' · yt-dlp ✗'}
          {tools.ffmpeg ? ' · ffmpeg ✓' : ' · ffmpeg ✗'}
        </p>
      )}

      <div className="max-w-xl space-y-5 rounded-xl bg-[#181818] p-6">
        <div className="space-y-2">
          <span className="text-sm font-semibold text-[#b3b3b3]">Download folder</span>
          <div className="flex gap-2">
            <input
              className="field field-box flex-1"
              value={settings.musicDirectory}
              readOnly
              title={settings.musicDirectory}
            />
            <button type="button" className="btn-ghost" onClick={() => void onBrowse()}>
              Change
            </button>
          </div>
          <p className="text-xs text-[#6a6a6a]">
            Auto-discovered as your Music folder → Sourney. Created automatically when needed.
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-[#1ed760] hover:underline"
            onClick={() => void apply({ musicDirectory: '__default__' })}
          >
            Use default folder
          </button>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-[#b3b3b3]">Audio format</span>
          <select
            className="field field-box"
            value={settings.audioFormat}
            onChange={(event) => void apply({ audioFormat: event.target.value as AudioFormat })}
          >
            {FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-[#b3b3b3]">Audio quality</span>
          <select
            className="field field-box"
            value={settings.audioQuality}
            disabled={lossless}
            onChange={(event) => void apply({ audioQuality: event.target.value as AudioQuality })}
          >
            {QUALITIES.map((quality) => (
              <option key={quality.value} value={quality.value}>
                {quality.label}
              </option>
            ))}
          </select>
          <span className="block text-xs text-[#6a6a6a]">
            {lossless
              ? 'Quality does not apply to lossless formats (FLAC/WAV).'
              : 'Covers are resized to 512px JPEG and stored beside each song.'}
          </span>
        </label>
      </div>
    </section>
  )
}
