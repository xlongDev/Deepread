/**
 * Real cover extraction (spec: 书籍封面). Uses the reading kernel itself:
 * EPUB/MOBI expose getCover(), PDF page 1 renders through pdf.js. Falls back
 * to null so the shelf can draw its generated cover. Results are object URLs
 * the caller caches per book hash.
 */

import { EPUB } from 'foliate-js/epub.js'
import { MOBI } from 'foliate-js/mobi.js'
import { unzlibSync } from 'foliate-js/vendor/fflate.js'
import { BlobReader, BlobWriter, TextWriter, ZipReader, configure } from 'foliate-js/vendor/zip.js'
import type { BookFormat } from '@deepread/reader-core'
import type { FoliateBook } from 'foliate-js/view.js'

async function makeZipLoader(file: File) {
  configure({ useWebWorkers: false })
  const reader = new ZipReader(new BlobReader(file))
  const entries = await reader.getEntries()
  const map = new Map(entries.map((entry) => [entry.filename, entry]))
  const load =
    <T, A extends unknown[]>(
      f: (entry: NonNullable<ReturnType<typeof map.get>>, ...args: A) => Promise<T>,
    ) =>
    (name: string, ...args: A): Promise<T> | null =>
      map.has(name) ? f(map.get(name)!, ...args) : null
  return {
    entries,
    loadText: load((entry) => entry.getData(new TextWriter()) as Promise<string>),
    loadBlob: load((entry, type: string) => entry.getData(new BlobWriter(type)) as Promise<Blob>),
    getSize: (name: string) => map.get(name)?.uncompressedSize ?? 0,
  }
}

async function kernelCover(book: FoliateBook): Promise<string | null> {
  try {
    const cover = await book.getCover?.()
    return cover ? URL.createObjectURL(cover) : null
  } catch {
    return null
  }
}

async function fetchAsFile(url: string, name: string, type: string): Promise<File | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return new File([blob], name, { type })
  } catch {
    return null
  }
}

export async function extractEpubCover(url: string): Promise<string | null> {
  const file = await fetchAsFile(url, 'book.epub', 'application/epub+zip')
  if (!file) return null
  try {
    const book = await new EPUB(await makeZipLoader(file)).init()
    return await kernelCover(book)
  } catch {
    return null
  }
}

export async function extractMobiCover(url: string): Promise<string | null> {
  const file = await fetchAsFile(url, 'book.mobi', 'application/x-mobipocket-ebook')
  if (!file) return null
  try {
    const book = await new MOBI({ unzlib: unzlibSync }).open(file)
    return await kernelCover(book)
  } catch {
    return null
  }
}

/** Render PDF page 1 to a small canvas and return it as an object URL. */
export async function extractPdfCover(url: string): Promise<string | null> {
  try {
    const pdfjs = await import('pdfjs-dist')
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        './books/vendor/pdfjs/pdf.worker.min.mjs',
        import.meta.url,
      ).toString()
    }
    const pdf = await pdfjs.getDocument({ url }).promise
    const page = await pdf.getPage(1)
    const baseViewport = page.getViewport({ scale: 1 })
    const scale = 480 / baseViewport.height
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext('2d')
    if (!context) return null
    await page.render({ canvasContext: context, viewport, canvas }).promise
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve))
    return blob ? URL.createObjectURL(blob) : null
  } catch {
    return null
  }
}

/** Extract a cover URL for a book; null means "draw the generated cover". */
export async function extractCover(url: string, format: BookFormat): Promise<string | null> {
  switch (format) {
    case 'epub':
      return extractEpubCover(url)
    case 'mobi':
    case 'azw3':
      return extractMobiCover(url)
    case 'pdf':
      return extractPdfCover(url)
    default:
      return null
  }
}
