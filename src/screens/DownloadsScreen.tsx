import { useEffect, useState, type ReactNode } from 'react'
import type { DownloadItem, DownloadProgressEvent } from '../../shared/types'
import { getApi } from '../api/client'
import { formatError } from '../lib/format'

export function DownloadsScreen() {
  const [items, setItems] = useState<DownloadItem[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      setItems(await getApi().listDownloads())
    } catch (err) {
      setError(formatError(err, 'Could not load downloads.'))
    }
  }

  useEffect(() => {
    void refresh()
    return getApi().onDownloadProgress((event: DownloadProgressEvent) => {
      setItems((prev) => {
        const index = prev.findIndex((item) => item.id === event.id)
        if (index < 0) {
          void refresh()
          return prev
        }
        const next = [...prev]
        next[index] = {
          ...next[index],
          progress: event.progress,
          speed: event.speed,
          statusText: event.statusText ?? next[index].statusText,
          status: event.status,
          error: event.error ?? next[index].error,
          filePath: event.filePath ?? next[index].filePath,
          updatedAt: new Date().toISOString(),
        }
        return next
      })
    })
  }, [])

  const active = items.filter((item) => item.status === 'pending' || item.status === 'downloading')
  const completed = items.filter((item) => item.status === 'completed')
  const other = items.filter((item) => item.status === 'failed' || item.status === 'cancelled')
  const canClear = completed.length + other.length > 0

  return (
    <section className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">Downloads</h1>
          <p className="text-sm text-[#b3b3b3]">
            One song downloads at a time. Pending items survive app restarts.
          </p>
        </div>
        {canClear && (
          <button
            type="button"
            className="btn-ghost"
            onClick={async () => {
              try {
                setItems(await getApi().clearDownloads())
              } catch (err) {
                setError(formatError(err, 'Could not clear history.'))
              }
            }}
          >
            Clear history
          </button>
        )}
      </header>

      {error && <p className="banner-error">{error}</p>}

      <DownloadGroup title="In progress" empty="Nothing downloading right now.">
        {active.map((item) => (
          <DownloadRow
            key={item.id}
            item={item}
            onCancel={async () => {
              try {
                await getApi().cancelDownload(item.id)
                await refresh()
              } catch (err) {
                setError(formatError(err))
              }
            }}
          />
        ))}
      </DownloadGroup>

      <DownloadGroup title="Completed" empty="No completed downloads yet.">
        {completed.map((item) => (
          <DownloadRow
            key={item.id}
            item={item}
            onOpenFolder={async () => {
              try {
                if (item.filePath) await getApi().showItemInFolder(item.filePath)
              } catch (err) {
                setError(formatError(err, 'Could not open folder.'))
              }
            }}
          />
        ))}
      </DownloadGroup>

      <DownloadGroup title="Failed / Cancelled" empty="No failed or cancelled downloads.">
        {other.map((item) => (
          <DownloadRow
            key={item.id}
            item={item}
            onRetry={async () => {
              try {
                await getApi().retryDownload(item.id)
                await refresh()
              } catch (err) {
                setError(formatError(err))
              }
            }}
          />
        ))}
      </DownloadGroup>
    </section>
  )
}

function DownloadGroup({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: ReactNode
}) {
  const childArray = Array.isArray(children) ? children : [children]
  const hasChildren = childArray.filter(Boolean).length > 0

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-bold uppercase tracking-[0.16em] text-[#b3b3b3]">{title}</h2>
      {hasChildren ? <div className="space-y-2">{children}</div> : (
        <p className="text-sm text-[#6a6a6a]">{empty}</p>
      )}
    </div>
  )
}

function DownloadRow({
  item,
  onCancel,
  onRetry,
  onOpenFolder,
}: {
  item: DownloadItem
  onCancel?: () => void
  onRetry?: () => void
  onOpenFolder?: () => void
}) {
  return (
    <article className="rounded-xl bg-[#181818] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{item.title}</h3>
          <p className="truncate text-sm text-[#b3b3b3]">{item.artist}</p>
          <p className="mt-1 text-xs text-[#6a6a6a]">{item.statusText || item.status}</p>
          {item.error && <p className="mt-1 text-xs text-[#f15e6c]">{item.error}</p>}
        </div>

        <div className="flex gap-2">
          {(item.status === 'pending' || item.status === 'downloading') && onCancel && (
            <button className="btn-ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
          {(item.status === 'failed' || item.status === 'cancelled') && onRetry && (
            <button className="btn-primary" onClick={onRetry}>
              Retry
            </button>
          )}
          {item.status === 'completed' && onOpenFolder && (
            <button className="btn-ghost" onClick={onOpenFolder}>
              Open folder
            </button>
          )}
        </div>
      </div>

      {(item.status === 'pending' || item.status === 'downloading') && (
        <div className="mt-4 space-y-1">
          <div className="flex justify-between text-xs text-[#b3b3b3]">
            <span>{Math.round(item.progress)}%</span>
            <span>{item.speed || item.statusText || '—'}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-[#4d4d4d]">
            <div
              className="progress-fill h-full rounded-full transition-all"
              style={{ width: `${Math.max(0, Math.min(100, item.progress))}%` }}
            />
          </div>
        </div>
      )}
    </article>
  )
}
