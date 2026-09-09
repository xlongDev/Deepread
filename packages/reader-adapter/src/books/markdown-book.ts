/**
 * Markdown books for the foliate kernel, rendered with `marked`.
 * Rendering MD to HTML is what the format means; the source is never rewritten.
 *
 * # ponytail: one section per file and no TOC extraction — most MD files are
 * small; split by headings when a real book-size MD shows up.
 */

import { marked } from 'marked'
import type { FoliateBook, FoliateSection } from 'foliate-js/view.js'
import { byteLength } from './bytes'

export function markdownToHtml(source: string): string {
  const body = marked.parse(source, { async: false, gfm: true })
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
    'body { margin: 0 auto; padding: 1em; max-width: 40em; }',
    'img { max-width: 100%; }',
    'pre { overflow-x: auto; }',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('\n')
}

export function buildMarkdownBook(source: string, title: string): FoliateBook {
  const html = markdownToHtml(source)
  const section: FoliateSection = {
    id: 's0',
    size: byteLength(source),
    load: async () => ({
      url: URL.createObjectURL(new Blob([html], { type: 'text/html' })),
    }),
    createDocument: async () => new DOMParser().parseFromString(html, 'text/html'),
  }

  return {
    metadata: { title },
    dir: 'ltr',
    toc: [],
    sections: [section],
    splitTOCHref: (href) => (href === 's0' ? [0, null] : [0, null]),
    getTOCFragment: (doc) => doc.body,
    resolveHref: async () => ({ index: 0 }),
  }
}
