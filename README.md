# Sourney — Local Music Downloader & Player

[![Download Latest](https://img.shields.io/github/v/release/ses-k/sourney?label=Download%20Latest&style=for-the-badge)](https://github.com/ses-k/sourney/releases/latest/download/Sourney-Setup.exe)

> **Everything exists to answer a question—and every answer should naturally lead to another question.**

Desktop MVP that searches for songs, downloads audio with an integrated `yt-dlp` backend, indexes tracks in a local SQLite database, and plays them in-app.

```text
Search → Select → Download → Save locally → Library → Play
```

## Download

**[Download Latest (Windows)](https://github.com/ses-k/sourney/releases/latest/download/Sourney-Setup.exe)** · [All releases](https://github.com/ses-k/sourney/releases)

The Windows installer **bundles yt-dlp and ffmpeg** — normal users do not need to install them separately.

## Requirements

### End users (installer)

- Windows 10/11 x64
- That’s it for the shipped app (tools are included)

### Developers (`npm run dev` / local builds)

- **Node.js** 20+ (22 recommended)
- **npm** 10+
- Bundled tools: run `npm run vendor:win` once (also runs automatically before `npm run build`)
- Or install system [yt-dlp](https://github.com/yt-dlp/yt-dlp) + [ffmpeg](https://ffmpeg.org/) on PATH

Optional override:

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

Local Windows build (optional):

```powershell
npm run build
```

### Publish a release (recommended)

```text
git push
   ↓
git tag v0.1.0 && git push origin v0.1.0
   ↓
GitHub Actions builds Sourney-Setup.exe
   ↓
GitHub Release created
   ↓
README “Download Latest” serves that .exe
```

```powershell
# 1) Commit your changes and push
git add .
git commit -m "your message"
git push origin main

# 2) Tag and push the tag (this triggers the Release workflow)
git tag v0.1.0
git push origin v0.1.0
```

After the workflow finishes, the stable download URL is always:

`https://github.com/ses-k/sourney/releases/latest/download/Sourney-Setup.exe`

Do **not** commit installers into the repo. Unsigned builds may show a Windows SmartScreen warning until you add code signing.

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
