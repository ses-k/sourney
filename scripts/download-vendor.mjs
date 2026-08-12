/**
 * Download Windows yt-dlp + ffmpeg/ffprobe into vendor/win for packaging.
 * Run automatically before `npm run build` (see package.json prebuild).
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'

const root = process.cwd()
const vendorDir = path.join(root, 'vendor', 'win')
const ytDlpUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
const ffmpegZipUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'

const required = ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe']

function allPresent() {
  return required.every((name) => fs.existsSync(path.join(vendorDir, name)))
}

async function download(url, dest) {
  console.log(`Downloading ${url}`)
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`)
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest))
  console.log(`Saved ${dest} (${fs.statSync(dest).size} bytes)`)
}

function findFile(dir, fileName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) return full
    if (entry.isDirectory()) {
      const nested = findFile(full, fileName)
      if (nested) return nested
    }
  }
  return null
}

function extractZip(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true })
  if (process.platform === 'win32') {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${outDir.replace(/'/g, "''")}' -Force`,
      ],
      { stdio: 'inherit' },
    )
    return
  }

  execFileSync('unzip', ['-o', zipPath, '-d', outDir], { stdio: 'inherit' })
}

async function main() {
  if (process.platform !== 'win32' && process.env.FORCE_VENDOR_WIN !== '1') {
    console.log('Skipping Windows vendor download (not on win32). Set FORCE_VENDOR_WIN=1 to force.')
    return
  }

  fs.mkdirSync(vendorDir, { recursive: true })
  if (allPresent() && process.env.FORCE_VENDOR_DOWNLOAD !== '1') {
    console.log('vendor/win already has yt-dlp.exe, ffmpeg.exe, ffprobe.exe — skipping download.')
    return
  }

  const ytDlpPath = path.join(vendorDir, 'yt-dlp.exe')
  if (!fs.existsSync(ytDlpPath) || process.env.FORCE_VENDOR_DOWNLOAD === '1') {
    await download(ytDlpUrl, ytDlpPath)
  }

  const needFfmpeg =
    !fs.existsSync(path.join(vendorDir, 'ffmpeg.exe')) ||
    !fs.existsSync(path.join(vendorDir, 'ffprobe.exe')) ||
    process.env.FORCE_VENDOR_DOWNLOAD === '1'

  if (needFfmpeg) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sourney-ffmpeg-'))
    const zipPath = path.join(tmpRoot, 'ffmpeg-essentials.zip')
    const extractDir = path.join(tmpRoot, 'extracted')
    try {
      await download(ffmpegZipUrl, zipPath)
      extractZip(zipPath, extractDir)
      const ffmpegExe = findFile(extractDir, 'ffmpeg.exe')
      if (!ffmpegExe) throw new Error('Could not find ffmpeg.exe inside ffmpeg zip')
      const binDir = path.dirname(ffmpegExe)
      for (const name of fs.readdirSync(binDir)) {
        const lower = name.toLowerCase()
        if (!lower.endsWith('.exe') && !lower.endsWith('.dll')) continue
        if (lower === 'ffplay.exe') continue
        fs.copyFileSync(path.join(binDir, name), path.join(vendorDir, name))
        console.log(`Copied ${name}`)
      }
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true })
    }
  }

  if (!allPresent()) {
    throw new Error(`Vendor binaries incomplete in ${vendorDir}`)
  }

  console.log('Bundled tools ready in vendor/win')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
