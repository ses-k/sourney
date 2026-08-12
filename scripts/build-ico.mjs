import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const src = path.resolve('build/icon.png')
if (!fs.existsSync(src)) {
  console.error('Missing build/icon.png')
  process.exit(1)
}

const sizes = [16, 24, 32, 48, 64, 128, 256]
const tmpDir = path.resolve('build', '.ico-tmp')
fs.rmSync(tmpDir, { recursive: true, force: true })
fs.mkdirSync(tmpDir, { recursive: true })

const files = []
for (const size of sizes) {
  const out = path.join(tmpDir, `icon-${size}.png`)
  await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out)
  files.push(out)
}

const ico = await pngToIco(files)
const icoPath = path.resolve('build/icon.ico')
fs.writeFileSync(icoPath, ico)
fs.copyFileSync(icoPath, path.resolve('public/favicon.ico'))
fs.rmSync(tmpDir, { recursive: true, force: true })

const hdr = Buffer.from(ico)
console.log({
  icoBytes: ico.length,
  reserved: hdr.readUInt16LE(0),
  type: hdr.readUInt16LE(2),
  count: hdr.readUInt16LE(4),
  path: icoPath,
})
