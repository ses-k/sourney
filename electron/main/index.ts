import { app, BrowserWindow, shell } from 'electron'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { Database } from '../services/Database'
import { DownloadService } from '../services/DownloadService'
import { LibraryService } from '../services/LibraryService'
import { MetadataService } from '../services/MetadataService'
import { SearchService } from '../services/SearchService'
import { SettingsService } from '../services/SettingsService'
import { YtDlpService } from '../services/YtDlpService'
import { getDefaultMusicDirectory } from '../services/paths'
import { registerIpcHandlers } from './ipc'
import {
  registerMediaProtocolHandler,
  registerMediaSchemeAsPrivileged,
  setMediaAllowedRoots,
} from './mediaProtocol'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// node:sqlite may still require the experimental flag depending on Node/Electron version
app.commandLine.appendSwitch('js-flags', '--experimental-sqlite')
registerMediaSchemeAsPrivileged()

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (process.platform === 'win32' && os.release().startsWith('6.1')) {
  app.disableHardwareAcceleration()
}

if (process.platform === 'win32') {
  app.setAppUserModelId('com.sourney.music')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
let database: Database | null = null

const preload = path.join(__dirname, '../preload/index.cjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

function resolveAppIcon(): string {
  const candidates = [
    // Packaged: Vite copies public/ → dist/
    path.join(RENDERER_DIST, 'icon.png'),
    path.join(RENDERER_DIST, 'favicon.ico'),
    // Dev / local build resources
    path.join(process.env.APP_ROOT!, 'build', 'icon.ico'),
    path.join(process.env.APP_ROOT!, 'build', 'icon.png'),
    path.join(process.env.VITE_PUBLIC!, 'icon.png'),
    path.join(process.env.VITE_PUBLIC!, 'favicon.ico'),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
}

async function createWindow() {
  const icon = resolveAppIcon()

  win = new BrowserWindow({
    title: 'Sourney',
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    icon,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon)
  }

  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[sourney] preload failed:', preloadPath, error)
  })

  win.webContents.on('did-finish-load', async () => {
    const hasApi = await win?.webContents.executeJavaScript(
      'Boolean(window.sourney)',
      true,
    )
    if (!hasApi) {
      console.error('[sourney] window.sourney is missing after load. Preload path:', preload)
    } else {
      console.log('[sourney] preload API ready')
    }
  })

  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    await win.loadFile(indexHtml)
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  registerMediaProtocolHandler()

  const settingsService = new SettingsService()
  setMediaAllowedRoots([
    settingsService.get().musicDirectory,
    getDefaultMusicDirectory(),
  ])
  database = new Database()
  const metadataService = new MetadataService()
  const libraryService = new LibraryService(database, metadataService)
  const ytDlpService = new YtDlpService()
  const searchService = new SearchService(ytDlpService)
  const downloadService = new DownloadService(ytDlpService, settingsService, libraryService)

  // Warm yt-dlp discovery so the first search isn't paying startup cost.
  void ytDlpService.ensureAvailable().catch((error) => {
    console.warn('[sourney] yt-dlp warmup failed:', error)
  })

  registerIpcHandlers({
    search: searchService,
    downloads: downloadService,
    library: libraryService,
    settings: settingsService,
    ytDlp: ytDlpService,
    getWindow: () => win,
  })

  downloadService.start()
  libraryService.reconcileMissingFiles()

  await createWindow()
})

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.focus()
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    void createWindow()
  }
})

app.on('before-quit', () => {
  database?.close()
})
