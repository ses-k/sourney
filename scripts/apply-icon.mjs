import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/apply-icon.mjs <source-png>')
  process.exit(1)
}

const { data, info } = await sharp(src)
  .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width, height, channels } = info
const isBg = (i) => {
  const r = data[i]
  const g = data[i + 1]
  const b = data[i + 2]
  // Outer canvas is near-black; green circle stays.
  return r < 45 && g < 45 && b < 45
}

const visited = new Uint8Array(width * height)
const queue = []
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return
  const p = y * width + x
  if (visited[p]) return
  const i = p * channels
  if (!isBg(i)) return
  visited[p] = 1
  queue.push(p)
}

// Flood-fill only background connected to the image edges (keeps black notes).
for (let x = 0; x < width; x++) {
  push(x, 0)
  push(x, height - 1)
}
for (let y = 0; y < height; y++) {
  push(0, y)
  push(width - 1, y)
}

while (queue.length) {
  const p = queue.pop()
  const x = p % width
  const y = (p / width) | 0
  data[p * channels + 3] = 0
  push(x + 1, y)
  push(x - 1, y)
  push(x, y + 1)
  push(x, y - 1)
}

const png = await sharp(data, { raw: { width, height, channels } }).png().toBuffer()

fs.mkdirSync('build', { recursive: true })
fs.mkdirSync('public', { recursive: true })
fs.writeFileSync(path.join('build', 'icon.png'), png)
fs.copyFileSync(path.join('build', 'icon.png'), path.join('public', 'icon.png'))

// Prefer multi-size ICO for Windows installer / EXE embedding.
const { spawnSync } = await import('node:child_process')
const built = spawnSync(process.execPath, [path.join('scripts', 'build-ico.mjs')], {
  stdio: 'inherit',
})
if (built.status !== 0) {
  const ico = await pngToIco([path.join('build', 'icon.png')])
  fs.writeFileSync(path.join('build', 'icon.ico'), ico)
  fs.copyFileSync(path.join('build', 'icon.ico'), path.join('public', 'favicon.ico'))
}

let transparent = 0
for (let i = 3; i < data.length; i += channels) if (data[i] === 0) transparent++
console.log({
  width,
  height,
  pngBytes: png.length,
  icoBytes: fs.statSync(path.join('build', 'icon.ico')).size,
  transparentPixels: transparent,
  cornerAlpha: data[3],
})
