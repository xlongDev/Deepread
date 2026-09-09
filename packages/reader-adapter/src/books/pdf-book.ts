/**
 * PDF books: bridges the vendored foliate PDF adapter (see `vendor/foliate-pdf.js`)
 * to PDF.js from npm. Loaded lazily so PDF.js never touches app startup.
 */

import * as pdfjs from 'pdfjs-dist'
import type { FoliateBook } from 'foliate-js/view.js'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  './vendor/pdfjs/pdf.worker.min.mjs',
  import.meta.url,
).toString()
globalThis.pdfjsLib = pdfjs

export async function buildPdfBook(file: File): Promise<FoliateBook> {
  const { makePDF } = await import('./vendor/foliate-pdf.js')
  return makePDF(file)
}
