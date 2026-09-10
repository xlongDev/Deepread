/**
 * Generates a real, minimal MOBI file (PalmDB + PalmDOC + MOBI header) so the
 * kernel's native MOBI parser has a genuine regression sample. Uncompressed
 * records (compression = 1) keep the generator dependency-free.
 *
 * Usage: node scripts/make-mobi.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const outPath = join(repoRoot, 'apps/desktop/public/fixtures/夜航船.mobi')

const TITLE = '夜航船'
const RECORD_SIZE = 4096
const MAC_EPOCH_OFFSET = 2082844800 // seconds between 1904 and 1970

const chapter = (title, paragraphs) =>
  [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<html><head><meta charset="utf-8"/><title>' + title + '</title></head><body>',
    '<h2>' + title + '</h2>',
    ...paragraphs.map((p) => `<p>${p}</p>`),
    // MOBI marks chapter boundaries with this tag; one chapter per record.
    '<mbp:pagebreak/>',
    '</body></html>',
  ].join('\n')

const chapters = [
  chapter('卷一 天文部', [
    '星:东方七宿,角亢氐房心尾箕。夜航者仰而识之,不须罗盘。',
    '云:朝霞不出门,晚霞行千里。船家看云,胜看历书。',
  ]),
  chapter('卷二 地理部', [
    '浙东夜航船,逢桥则缓,过滩则疾。艄公言:水路即文路,读通者不迷。',
    '潮:初一十五子午潮。候潮如候信,误一刻则失一渡。',
  ]),
  chapter('卷三 人物部', [
    '张岱尝言:天下学问,惟夜航船中最难对付。故作此书,随问随答。',
    '士人读万卷书,行万里路;船中人两样都要占,故灯火不灭。',
  ]),
]

const textRecords = []
for (const html of chapters) {
  const bytes = Buffer.from(html, 'utf8')
  for (let i = 0; i < bytes.length; i += RECORD_SIZE) {
    textRecords.push(bytes.subarray(i, i + RECORD_SIZE))
  }
}

const titleBuf = Buffer.from(TITLE, 'utf8')
const HLEN = 232
const MOBI_HEADER_START = 16
const fullNameOffset = MOBI_HEADER_START + HLEN

// --- Record 0: PalmDOC header + MOBI header + full name ---------------------
const palmdoc = Buffer.alloc(16)
palmdoc.writeUInt16BE(1, 0) // compression: none
palmdoc.writeUInt16BE(0, 2) // unused
palmdoc.writeUInt32BE(
  textRecords.reduce((sum, record) => sum + record.length, 0),
  4,
) // uncompressed text length
palmdoc.writeUInt16BE(textRecords.length, 8) // text record count
palmdoc.writeUInt16BE(RECORD_SIZE, 10) // record size
palmdoc.writeUInt16BE(0, 12) // encryption: none
palmdoc.writeUInt16BE(0, 14) // unknown

const mobi = Buffer.alloc(HLEN)
mobi.write('MOBI', 0, 'ascii')
mobi.writeUInt32BE(HLEN, 4)
mobi.writeUInt32BE(2, 8) // mobi type: book
mobi.writeUInt32BE(65001, 12) // text encoding: UTF-8
mobi.writeUInt32BE(424242, 16) // unique id
mobi.writeUInt32BE(6, 20) // file version
for (let offset = 24; offset < 60; offset += 4) {
  mobi.writeUInt32BE(0xffffffff, offset) // unused index fields
}
mobi.writeUInt32BE(0xffffffff, 60) // first non-book record
// The kernel (and the MOBI spec) place the full-name pointer at record-0
// offsets 84/88 — absolute positions, not MOBI-header-relative.
mobi.writeUInt32BE(fullNameOffset, 68) // [84 abs] full name offset
mobi.writeUInt32BE(titleBuf.length, 72) // [88 abs] full name length
mobi.writeUInt8(0, 78) // [94 abs] locale region
mobi.writeUInt8(9, 79) // [95 abs] locale language: en
mobi.writeUInt32BE(0xffffffff, 92) // [108 abs] resource start: no images
// huffman fields (abs 108..124) stay 0; EXTH flag (abs 128) = 0; trailing flags (abs 240) = 0

const record0 = Buffer.concat([palmdoc, mobi, titleBuf, Buffer.alloc(2, 0)])

// --- PalmDB container --------------------------------------------------------
const numRecords = 1 + textRecords.length
const headerLength = 78 + numRecords * 8 + 2
const header = Buffer.alloc(headerLength)
header.write('nightferry', 0, 'latin1') // 32-byte PDB name
header.writeUInt16BE(0, 32) // attributes
header.writeUInt16BE(0, 34) // version
const macNow = Math.floor(Date.now() / 1000) + MAC_EPOCH_OFFSET
header.writeUInt32BE(macNow, 36) // created
header.writeUInt32BE(macNow, 40) // modified
header.writeUInt32BE(0, 44) // backup
header.writeUInt32BE(1, 48) // modification number
header.writeUInt32BE(0, 52) // app info id
header.writeUInt32BE(0, 56) // sort info id
header.write('BOOK', 60, 'ascii')
header.write('MOBI', 64, 'ascii')
header.writeUInt32BE(424242, 68) // unique id seed
header.writeUInt32BE(0, 72) // next record list id
header.writeUInt16BE(numRecords, 76)

const buffers = [header]
let offset = headerLength
const records = [record0, ...textRecords]
records.forEach((record, index) => {
  header.writeUInt32BE(offset, 78 + index * 8)
  header.writeUInt8(0, 78 + index * 8 + 4) // attributes
  header.writeUInt16BE(index, 78 + index * 8 + 5) // uniqueID (3 bytes, 2 used + implicit)
  header.writeUInt8(0, 78 + index * 8 + 7)
  buffers.push(record)
  offset += record.length
})
buffers.push(Buffer.alloc(2, 0)) // record list padding

mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, Buffer.concat(buffers))
console.log(`written: ${outPath} (${records.length} records, ${offset} bytes)`)
