/**
 * Generates the app icon source PNG (1024×1024 RGBA) with zero dependencies.
 *
 * The design is a deliberate Phase 0 placeholder mark (indigo gradient,
 * open-book glyph, macOS squircle mask); visual polish comes later, and
 * `pnpm tauri icon` regenerates all platform sizes from this source.
 *
 * Usage: node scripts/make-icon.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(repoRoot, 'apps/desktop/src-tauri/icon-source.png')
const SIZE = 1024

const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n++) {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Signed distance to a rounded rectangle (negative inside). */
function roundedRectDistance(x, y, cx, cy, halfW, halfH, r) {
  const dx = Math.abs(x - cx) - (halfW - r)
  const dy = Math.abs(y - cy) - (halfH - r)
  const ox = Math.max(dx, 0)
  const oy = Math.max(dy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r
}

function clamp01(t) {
  return Math.min(1, Math.max(0, t))
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

function pixel(x, y) {
  const t = clamp01((x + y) / (2 * SIZE))
  // Deep indigo → slate diagonal gradient.
  let r = Math.round(lerp(30, 46, t))
  let g = Math.round(lerp(37, 54, t))
  let b = Math.round(lerp(66, 96, t))

  // Open-book mark: two rounded page panels with subtle vertical shading.
  const left = roundedRectDistance(x, y, 512 - 118, 512, 200, 148, 36)
  const right = roundedRectDistance(x, y, 512 + 118, 512, 200, 148, 36)
  const pages = Math.min(left, right)
  if (pages < 0) {
    const shade = clamp01((y - 364) / 296)
    r = Math.round(lerp(246, 232, shade))
    g = Math.round(lerp(244, 228, shade))
    b = Math.round(lerp(240, 220, shade))
  }
  // Accent spine between the pages.
  const spine = roundedRectDistance(x, y, 512, 512, 10, 148, 10)
  if (spine < 0) {
    r = 61
    g = 109
    b = 235
  }

  // macOS-style squircle mask with 2px anti-aliased edge.
  const mask = roundedRectDistance(x, y, 512, 512, 512, 512, 230)
  const alpha = mask >= 2 ? 0 : mask <= -2 ? 255 : Math.round(255 * clamp01((2 - mask) / 4))
  return [r, g, b, alpha]
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // color type RGBA

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4))
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (1 + SIZE * 4)
  raw[rowStart] = 0 // filter: none
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = pixel(x, y)
    const i = rowStart + 1 + x * 4
    raw[i] = r
    raw[i + 1] = g
    raw[i + 2] = b
    raw[i + 3] = a
  }
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(outPath, png)
console.log(`written: ${outPath}`)
