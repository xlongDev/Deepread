/**
 * Format detection and the kernel support matrix (spec §7: only formats the
 * kernel really renders are listed as supported; nothing is faked).
 */

import type { BookFormat } from '@deepread/reader-core'

export type KernelSupport = 'native' | 'adapter' | 'unsupported'

export const FORMAT_SUPPORT: Readonly<Record<BookFormat, KernelSupport>> = {
  epub: 'native',
  mobi: 'native',
  azw3: 'native',
  fb2: 'native',
  cbz: 'native',
  pdf: 'adapter',
  txt: 'adapter',
  md: 'adapter',
  // foliate-js ships no CHM parser; the reader-core contract still allows the
  // format so a future parser can slot in without touching the business layer.
  chm: 'unsupported',
}

const EXTENSION_TO_FORMAT: Readonly<Record<string, BookFormat>> = {
  epub: 'epub',
  mobi: 'mobi',
  prc: 'mobi',
  azw: 'mobi',
  azw3: 'azw3',
  kf8: 'azw3',
  fb2: 'fb2',
  fbz: 'fb2',
  cbz: 'cbz',
  pdf: 'pdf',
  txt: 'txt',
  text: 'txt',
  md: 'md',
  markdown: 'md',
  chm: 'chm',
}

/** Detect the format from the original file name (extension-based). */
export function detectFormat(fileName: string): BookFormat | null {
  const name = fileName.toLowerCase()
  if (name.endsWith('.fb2.zip')) return 'fb2'
  const extension = name.split('.').pop() ?? ''
  return EXTENSION_TO_FORMAT[extension] ?? null
}

export function isSupported(format: BookFormat): boolean {
  return FORMAT_SUPPORT[format] !== 'unsupported'
}
