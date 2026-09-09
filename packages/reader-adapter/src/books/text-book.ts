/**
 * Plain-text books for the foliate kernel.
 *
 * The kernel has no TXT parser, so this implements its `book` interface
 * directly (README: "Add support for other formats yourself"). The text is
 * never rewritten: paragraphs are wrapped in <p> and escaped, nothing else.
 * The file is split into sections of a bounded paragraph count so large books
 * do not create one giant iframe.
 */

import type { FoliateBook, FoliateSection, FoliateTocItem } from 'foliate-js/view.js'
import { byteLength } from './bytes'

const PARAGRAPHS_PER_SECTION = 400

export function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    // Not valid UTF-8: common Chinese web novels are GBK/GB18030.
    try {
      return new TextDecoder('gb18030').decode(buffer)
    } catch {
      return new TextDecoder().decode(buffer)
    }
  }
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function splitParagraphs(text: string): string[] {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
}

function sectionHtml(paragraphs: readonly string[]): string {
  const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('\n')
  return [
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>',
    'body { margin: 0; padding: 1em; }',
    '</style></head><body>',
    body,
    '</body></html>',
  ].join('\n')
}

export function buildTextBook(text: string, title: string): FoliateBook {
  const paragraphs = splitParagraphs(text)
  const sections: FoliateSection[] = []

  const total = paragraphs.length
  for (let start = 0; start < total; start += PARAGRAPHS_PER_SECTION) {
    const chunk = paragraphs.slice(start, start + PARAGRAPHS_PER_SECTION)
    const html = sectionHtml(chunk)
    const index = sections.length
    sections.push({
      id: `s${index}`,
      size: byteLength(chunk.join('\n\n')),
      load: async () => ({
        url: URL.createObjectURL(new Blob([html], { type: 'text/html' })),
      }),
      // # ponytail: every section keeps its full HTML in memory for instant
      // re-open; swap to on-demand rebuild from the source buffer if a 100MB
      // TXT actually shows memory pressure.
      createDocument: async () => new DOMParser().parseFromString(html, 'text/html'),
    })
  }

  return {
    metadata: { title },
    dir: 'ltr',
    toc: [] satisfies FoliateTocItem[],
    sections,
    splitTOCHref: (href) => {
      const match = /^s(\d+)$/.exec(href)
      return match ? [Number(match[1]), null] : [0, null]
    },
    getTOCFragment: (doc) => doc.body,
    resolveHref: async (href) => {
      const match = /^s(\d+)$/.exec(href)
      return { index: match ? Number(match[1]) : 0 }
    },
  }
}
