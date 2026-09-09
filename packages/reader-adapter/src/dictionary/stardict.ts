/**
 * StarDict dictionary parsing (`.idx` index + `.dict` definitions).
 *
 * Scope (Phase 2 MVP, honest limits):
 * - `.idx` raw or gzip/`.dz` compressed (inflated with DecompressionStream)
 * - lookup is exact match with ASCII-case-insensitive fallback (# ponytail:
 *   linear scan over decoded words is O(n) per query; switch to a sorted
 *   byte-compare binary search if large dictionaries feel slow)
 * - definitions follow `sametypesequence`: m/l/y → plain text, g/h/x → HTML
 *   (sanitize before injecting — see `sanitizeDefinitionHtml`)
 */

const textDecoder = new TextDecoder()

export interface DictIndexEntry {
  readonly word: string
  readonly offset: number
  readonly size: number
}

export type DefinitionField = { readonly type: 'text' | 'html'; readonly content: string }

export interface DictLookupResult {
  readonly word: string
  readonly fields: readonly DefinitionField[]
}

export async function inflateGzip(data: Uint8Array): Promise<Uint8Array> {
  // Runtime accepts any ArrayBufferView; TS 5.9's BlobPart narrowing is stricter.
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export function buildIndex(idx: Uint8Array): readonly DictIndexEntry[] {
  const entries: DictIndexEntry[] = []
  let position = 0
  while (position < idx.length) {
    let end = position
    while (end < idx.length && idx[end] !== 0) end++
    if (end >= idx.length) break
    const word = textDecoder.decode(idx.subarray(position, end))
    const offsetView = new DataView(idx.buffer, idx.byteOffset + end + 1, 8)
    entries.push({
      word,
      offset: offsetView.getUint32(0),
      size: offsetView.getUint32(4),
    })
    position = end + 9
  }
  return entries
}

const HTML_TYPES = new Set(['g', 'h', 'x'])

/** Split one entry's raw data into typed fields following `sametypesequence`. */
export function decodeFields(
  raw: Uint8Array,
  sequence: string | undefined,
): readonly DefinitionField[] {
  const types = sequence && sequence.length > 0 ? sequence : 'm'
  const fields: DefinitionField[] = []
  let position = 0
  for (let i = 0; i < types.length; i++) {
    const isLast = i === types.length - 1
    const size = isLast
      ? raw.length - position
      : new DataView(raw.buffer, raw.byteOffset + position, 4).getUint32(0)
    const start = position + (isLast ? 0 : 4)
    const type = HTML_TYPES.has(types[i] ?? 'm') ? 'html' : 'text'
    fields.push({ type, content: textDecoder.decode(raw.subarray(start, start + size)) })
    if (!isLast) position = start + size
  }
  return fields
}

/** Case-insensitive exact lookup; falls back to byte-order equality. */
export function lookupWord(
  entries: readonly DictIndexEntry[],
  dict: Uint8Array,
  target: string,
  sequence: string | undefined,
): readonly DictLookupResult[] {
  const lowered = target.toLowerCase()
  const results: DictLookupResult[] = []
  for (const entry of entries) {
    if (entry.word.toLowerCase() !== lowered && entry.word !== target) continue
    const raw = dict.subarray(entry.offset, entry.offset + entry.size)
    results.push({ word: entry.word, fields: decodeFields(raw, sequence) })
  }
  return results
}

/** Sibling file candidates for a `.ifo` path, in registration order. */
export function dictionaryFileCandidates(ifoPath: string): {
  readonly idx: readonly string[]
  readonly dict: readonly string[]
} {
  const withoutExtension = ifoPath.replace(/\.[^./\\]+$/, '')
  return {
    idx: [`${withoutExtension}.idx`, `${withoutExtension}.idx.gz`, `${withoutExtension}.idx.dz`],
    dict: [
      `${withoutExtension}.dict`,
      `${withoutExtension}.dict.dz`,
      `${withoutExtension}.dict.gz`,
    ],
  }
}

/** Strip active content from dictionary HTML (CSP is the second line of defense). */
export function sanitizeDefinitionHtml(html: string, doc: DOMParser): string {
  const parsed = doc.parseFromString(`<div>${html}</div>`, 'text/html')
  for (const element of parsed.querySelectorAll('script, iframe, object, embed, link, style')) {
    element.remove()
  }
  for (const element of parsed.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name)
    }
  }
  return parsed.body.firstElementChild?.innerHTML ?? ''
}
