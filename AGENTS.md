# Agent Instructions — Sourney Music Downloader

This document is the source of truth for AI agents working on this repository.
Follow it for every change. Prefer working functionality over polish.

## Product

Sourney is a **local desktop music downloader & player** (Electron + React + TypeScript).

Core loop that must always work:

```text
Search → Select → Download (yt-dlp) → Save locally → Index in SQLite → Play
```

MVP scope only. Do **not** add accounts, cloud sync, social features, playlists-as-a-product, payments, or multi-user permissions.

## Architecture (do not break)

```text
UI (React renderer)
 │  Search | Downloads | Library | Settings | Player
 ▼
IPC bridge (preload → typed API)
 ▼
Application services (Electron main)
 │  SearchService | DownloadService | LibraryService | MetadataService | SettingsService
 ▼
Infrastructure
 │  YtDlpService | SQLite | Filesystem | shell/dialog
```

Rules:

- UI must **never** call `yt-dlp` or touch the database directly.
- All `yt-dlp` usage lives in `electron/services/YtDlpService.ts`.
- Windows releases bundle `yt-dlp` + `ffmpeg`/`ffprobe` from `vendor/win` (downloaded by `npm run vendor:win`, packaged as `resources/bin`). Prefer bundled tools, then system PATH.
- Downloads run in the main process (never block the renderer).
- Player state lives in the renderer so playback continues across screen changes.
- Prefer extending service interfaces over leaking infrastructure details upward.
- Do **not** build a release/executable unless the user explicitly asks.

## Key paths

| Path | Purpose |
|------|---------|
| `electron/main/` | App shell, IPC registration |
| `electron/preload/` | Secure `contextBridge` API |
| `electron/services/` | Business logic + infrastructure |
| `shared/` | Types and IPC channel names shared by main/renderer |
| `src/screens/` | Search, Downloads, Library, Settings |
| `src/components/` | Player bar, shared UI |
| `src/hooks/` | Renderer state hooks |
| `userData/` (runtime) | Settings JSON + SQLite DB (via `app.getPath('userData')`) |

## Data model

SQLite `tracks` table (minimum):

- `id`, `title`, `artist`, `album`, `duration`, `file_path`, `artwork_path`, `source_url`, `created_at`

User-created albums (local collections of library tracks):

- `albums`: `id`, `name`, `created_at`, `updated_at`
- `album_tracks`: `album_id`, `track_id`, `position`, `added_at`

Deleting an album does not delete songs. Deleting a track removes it from albums.

Downloads have separate status: `pending` | `downloading` | `completed` | `failed` | `cancelled`.

File layout:

```text
Music/
  Artist/
    Song Title.mp3
  Unknown Artist/
    Song Title.mp3
```

## Agent workflow

1. Keep the app runnable after each meaningful change (`npm run typecheck`, `npm run dev`).
2. Prefer minimal diffs that complete the user-requested loop.
3. Update `README.md` when install/run/build steps or storage locations change.
4. Do not commit unless the user asks.
5. Do not build releases unless the user asks.
6. Do not add auth, cloud, or unrelated features “for completeness”.
