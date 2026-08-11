# Agent Instructions (Sourney)

This file mirrors the project’s agent contract. Prefer [`AGENTS.md`](../AGENTS.md) as the canonical copy; Cursor also loads [`.cursor/rules/sourney-music-mvp.mdc`](../.cursor/rules/sourney-music-mvp.mdc).

## Mission

Maintain a working local desktop MVP:

```text
Search → Download (yt-dlp) → Save → SQLite library → Play
```

## Hard rules

1. Keep `yt-dlp` isolated in `electron/services/YtDlpService.ts`.
2. Renderer talks only through the preload API (`window.sourney` / `src/api/client.ts`).
3. Downloads run in the main process; never block the UI thread.
4. Player state stays in the renderer so tab switches do not stop audio.
5. No accounts, cloud sync, social features, payments, or shared playlists in the MVP.
6. Errors must surface in the UI; missing metadata/artwork/dirs must not crash the app.
7. One download at a time (`pending` → `downloading` → `completed` | `failed` | `cancelled`).
8. Keep the app runnable after meaningful changes (`npm run typecheck`, `npm run dev`).
9. Do not build a release/executable unless the user explicitly asks.

## When finishing work

- Confirm the core loop still works when the change touches search/download/library/player.
- Update `README.md` if install, yt-dlp, packaging, or storage locations change.
- Do not commit unless the user explicitly asks.
