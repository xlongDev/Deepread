/**
 * Kernel regression against real book samples in `public/fixtures/`
 * (spec §9: only formats verified against real files may claim support).
 * The foliate kernel is browser-first, so this runs under jsdom; the
 * `URL.createObjectURL` shim only satisfies section loaders we never fetch.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { makeFB2 } from 'foliate-js/fb2.js'
import { buildMobiBook } from '@deepread/reader-adapter'

const fixtureFile = (name: string): File =>
  new File([readFileSync(join(process.cwd(), 'public/fixtures', name))], name)

beforeAll(() => {
  const urlWithCreateObjectURL = URL as unknown as { createObjectURL?: (blob: Blob) => string }
  if (!urlWithCreateObjectURL.createObjectURL) {
    urlWithCreateObjectURL.createObjectURL = (blob: Blob) => `blob:fixture-${blob.size}`
  }
})

describe('MOBI kernel regression (generated real binary)', () => {
  it('detects and parses the PalmDB/PalmDOC/MOBI fixture', async () => {
    const file = fixtureFile('夜航船.mobi')
    const book = await buildMobiBook(file)
    expect(book.metadata?.title).toBe('夜航船')
    expect(book.sections.length).toBeGreaterThanOrEqual(4)
    expect(book.sections.every((section) => section.size >= 0)).toBe(true)
    expect(typeof book.sections[0]?.load).toBe('function')
  })
})

describe('FB2 kernel regression (hand-authored FictionBook 2.0)', () => {
  it('parses metadata and per-chapter sections', async () => {
    const book = await makeFB2(fixtureFile('山中手记.fb2'))
    expect(book.metadata?.title).toBe('山中手记')
    expect(book.sections.length).toBeGreaterThanOrEqual(1)
    expect(typeof book.sections[0]?.load).toBe('function')
  })
})
