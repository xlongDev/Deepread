import { describe, expect, it } from 'vitest'
import { FORMAT_SUPPORT, detectFormat, isSupported } from './format'

describe('detectFormat', () => {
  it('maps common ebook extensions', () => {
    expect(detectFormat('三体.epub')).toBe('epub')
    expect(detectFormat('book.MOBI')).toBe('mobi')
    expect(detectFormat('book.azw3')).toBe('azw3')
    expect(detectFormat('book.kf8')).toBe('azw3')
    expect(detectFormat('novel.fb2.zip')).toBe('fb2')
    expect(detectFormat('scan.cbz')).toBe('cbz')
    expect(detectFormat('manual.PDF')).toBe('pdf')
    expect(detectFormat('notes.md')).toBe('md')
    expect(detectFormat('novel.txt')).toBe('txt')
  })

  it('returns null for unknown extensions', () => {
    expect(detectFormat('archive.xyz')).toBeNull()
    expect(detectFormat('noextension')).toBeNull()
  })
})

describe('FORMAT_SUPPORT', () => {
  it('marks kernel-native formats, adapter formats and the unsupported reality', () => {
    expect(FORMAT_SUPPORT['epub']).toBe('native')
    expect(FORMAT_SUPPORT['azw3']).toBe('native')
    expect(FORMAT_SUPPORT['cbz']).toBe('native')
    expect(FORMAT_SUPPORT['pdf']).toBe('adapter')
    expect(FORMAT_SUPPORT['txt']).toBe('adapter')
    expect(FORMAT_SUPPORT['md']).toBe('adapter')
    // Honest limitation: foliate-js has no CHM parser (spec: never fake support).
    expect(FORMAT_SUPPORT['chm']).toBe('unsupported')
  })

  it('isSupported agrees with the matrix', () => {
    expect(isSupported('epub')).toBe(true)
    expect(isSupported('chm')).toBe(false)
  })
})
