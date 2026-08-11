# Sourney — Local Music Downloader & Player

> **Everything exists to answer a question—and every answer should naturally lead to another question.**

Desktop MVP that searches for songs, downloads audio with an integrated `yt-dlp` backend, indexes tracks in a local SQLite database, and plays them in-app.

```text
Search → Select → Download → Save locally → Library → Play
```

## Requirements

- **Node.js** 20+ (22 recommended)
- **npm** 10+
- **yt-dlp** on your PATH (or installable as a Python module)
- **ffmpeg** on your PATH (required by yt-dlp for audio extraction / metadata embedding)

### Install yt-dlp (Windows examples)

```powershell
winget install yt-dlp.yt-dlp
winget install Gyan.FFmpeg
```

Or via pip:

```powershell
python -m pip install -U yt-dlp
```

The app resolves `yt-dlp` from `PATH`, `YTDLP_PATH`, common install locations, or `python -m yt_dlp`.

Optional:

```powershell
$env:YTDLP_PATH = "C:\path\to\yt-dlp.exe"
```

## Setup

```powershell
cd sourney
npm install
```

## Run (development)

```powershell
npm run dev
```

Use the Electron desktop window (not a browser tab).

## Build / package

Only when you want a packaged app.

**Windows** (this machine):

```powershell
npm run build
```

Artifacts under `release/<version>/`:

- `Sourney-<version>-portable.exe`
- `Sourney-<version>-win-x64.exe` (NSIS installer)

**macOS** must be built on a Mac (or via GitHub Actions). Do **not** commit installers into the repo.

### Publish downloads (recommended)

1. Push the source + tag a version, e.g. `v0.1.0`
2. The **Release** workflow builds Windows + macOS and attaches installers to a [GitHub Release](https://github.com/ses-k/sourney/releases)
3. Share that release URL — people download the `.exe` / `.dmg` from there

```powershell
git tag v0.1.0
git push origin v0.1.0
```

Unsigned builds will show SmartScreen (Windows) / Gatekeeper (macOS) warnings until you add code signing.

## Where data is stored

| Data | Location |
|------|----------|
| Settings (`settings.json`) | Electron `userData` |
| SQLite library (`sourney-library.sqlite`) | Electron `userData` |
| Downloaded audio | Auto-discovered `<OS Music>/Sourney` (changeable in Settings) |
| Cover art | Compressed 512px JPEG next to each song |

On Windows, `userData` is typically `%APPDATA%\sourney\`.

### Storage / offline size

Downloads are optimized for a small local library (similar idea to Spotify offline):

- Default format/quality: **Opus @ medium** (~96 kbps)
- Audio is forced to stereo and capped by the quality bitrate
- Cover art is written as a small 512px JPEG sidecar (not embedded into the audio file)
- Duplicate downloads of the same source URL are blocked
- Prefer **Opus** or **M4A** over FLAC/WAV unless you need lossless

Change format/quality anytime in **Settings** (existing files are not re-encoded). Pending downloads are restored after restart.

## Agent instructions

- [`AGENTS.md`](./AGENTS.md)
- [`docs/AGENT_INSTRUCTIONS.md`](./docs/AGENT_INSTRUCTIONS.md)
- [`.cursor/rules/sourney-music-mvp.mdc`](./.cursor/rules/sourney-music-mvp.mdc)
