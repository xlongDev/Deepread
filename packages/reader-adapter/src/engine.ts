/**
 * FoliateAdapter — the only place in the product allowed to touch the
 * foliate-js kernel (spec §6). Implements the `ReaderEngine` contract from
 * `@deepread/reader-core`; the business layer depends solely on that contract.
 *
 * Format dispatch (see format.ts):
 * - native kernel parsers: EPUB, MOBI/AZW3, FB2, CBZ
 * - adapter-built kernel `book` objects: PDF (vendored foliate PDF adapter +
 *   PDF.js), TXT, MD
 * - CHM: rejected with BOOK_UNSUPPORTED_FORMAT (no kernel parser exists)
 */

import { AppError, ErrorCodes, toAppError } from '@deepread/shared'
import type {
  Annotation,
  BookMetadata,
  BookSource,
  ReaderEngine,
  ReaderLayout,
  ReaderTheme,
  ReadingLocation,
  SearchResult,
  TextRange,
  TocItem,
} from '@deepread/reader-core'
import type { FoliateAnnotation, FoliateTocItem, View, ViewLocation } from 'foliate-js/view.js'
import { Overlayer } from 'foliate-js/overlayer.js'
import { isSupported } from './format'
import { buildTextBook, decodeText } from './books/text-book'
import { buildMarkdownBook } from './books/markdown-book'

import 'foliate-js/view.js'

const MAX_SEARCH_RESULTS = 200
const MAX_SELECTION_TEXT = 2000
const DEFAULT_HIGHLIGHT_COLOR = '#f5d76e'

export interface EngineLocation {
  readonly cfi: string | undefined
  readonly fraction: number | undefined
  readonly tocLabel: string | undefined
  readonly location: { readonly current: number; readonly total: number } | undefined
}

export interface EngineSelection {
  readonly cfi: string
  readonly text: string
  /** Selection bounding box in viewport coordinates, for the toolbar anchor. */
  readonly rect: { readonly top: number; readonly left: number; readonly height: number }
}

export type TapZone = 'left' | 'right' | 'center'

export interface EngineCallbacks {
  onRelocate?: (location: EngineLocation) => void
  onSelection?: (selection: EngineSelection | null) => void
  onShowAnnotation?: (cfi: string) => void
  onTapZone?: (zone: TapZone) => void
}

function titleFromName(name: string): string {
  return name.replace(
    /\.(epub|mobi|azw3?|kf8|prc|fb2|zip|cbz|pdf|txt|text|md|markdown|fbz|chm)$/i,
    '',
  )
}

function buildReaderCSS(theme: ReaderTheme, fontSize?: number): string {
  return [
    `html { font-size: ${fontSize ?? 16}px; }`,
    `html, body { background: ${theme.background} !important; color: ${theme.foreground} !important; }`,
  ].join('\n')
}

export class FoliateAdapter implements ReaderEngine {
  #view: View | null = null
  readonly #host: HTMLElement
  readonly #callbacks: EngineCallbacks
  readonly #annotationCfis = new Map<string, string>()
  #theme: ReaderTheme | null = null
  #fontSize: number | undefined

  constructor(host: HTMLElement, callbacks: EngineCallbacks = {}) {
    this.#host = host
    this.#callbacks = callbacks
  }

  #applyStyles(): void {
    const view = this.#view
    if (!view || view.isFixedLayout || !this.#theme) return
    view.renderer.setStyles?.(buildReaderCSS(this.#theme, this.#fontSize))
  }

  #requireView(): View {
    if (this.#view) return this.#view
    const view = document.createElement('foliate-view') as View
    view.addEventListener('relocate', (event) => {
      const detail = (event as CustomEvent).detail as ViewLocation
      this.#callbacks.onRelocate?.({
        cfi: detail.cfi,
        fraction: detail.fraction,
        tocLabel: detail.tocItem?.label,
        location: detail.location,
      })
    })
    view.addEventListener('load', (event) => {
      const { doc, index } = (event as CustomEvent).detail as { doc: Document; index: number }
      doc.addEventListener('pointerup', (domEvent) => {
        const selection = doc.getSelection()
        if (!selection || selection.isCollapsed) {
          this.#callbacks.onSelection?.(null)
          // Page-turn zones: taps in the outer thirds of reflowable pages turn
          // the page, a tap in the middle toggles the reading chrome.
          const target = domEvent.target
          const interactive =
            target instanceof Element && target.closest('a, button, input, [role="button"]')
          if (!interactive && doc.defaultView) {
            const ratio = domEvent.clientX / Math.max(1, doc.defaultView.innerWidth)
            this.#callbacks.onTapZone?.(ratio < 0.3 ? 'left' : ratio > 0.7 ? 'right' : 'center')
          }
          return
        }
        const range = selection.getRangeAt(0)
        const text = selection.toString().slice(0, MAX_SELECTION_TEXT)
        if (!text.trim()) {
          this.#callbacks.onSelection?.(null)
          return
        }
        const rect = range.getBoundingClientRect()
        this.#callbacks.onSelection?.({
          cfi: this.#requireView().getCFI(index, range),
          text,
          rect: { top: rect.top, left: rect.left, height: rect.height },
        })
      })
    })
    view.addEventListener('draw-annotation', (event) => {
      const { draw, annotation } = (event as CustomEvent).detail as {
        draw: (func: typeof Overlayer.highlight, opts?: { color?: string }) => void
        annotation: FoliateAnnotation
      }
      draw(Overlayer.highlight, { color: annotation.color ?? DEFAULT_HIGHLIGHT_COLOR })
    })
    view.addEventListener('show-annotation', (event) => {
      const { value } = (event as CustomEvent).detail as { value: string }
      this.#callbacks.onShowAnnotation?.(value)
    })
    this.#view = view
    this.#host.append(view)
    return view
  }

  async open(source: BookSource): Promise<void> {
    if (!isSupported(source.format)) {
      throw new AppError(
        ErrorCodes.bookUnsupportedFormat,
        `CHM 尚不支持:${source.name ?? '该文件'}。`,
      )
    }
    const view = this.#requireView()
    try {
      const response = await fetch(source.url)
      if (!response.ok) {
        throw new AppError(ErrorCodes.bookOpenFailed, `无法读取书籍数据(${source.url})。`)
      }
      const blob = await response.blob()
      // The kernel dispatches zip-based formats by file extension/type, which a
      // bare blob URL cannot express — always hand it a properly named File.
      const file = new File([blob], source.name ?? 'book', { type: blob.type })

      switch (source.format) {
        case 'pdf': {
          const { buildPdfBook } = await import('./books/pdf-book')
          await view.open(await buildPdfBook(file))
          break
        }
        case 'txt': {
          await view.open(
            buildTextBook(decodeText(await file.arrayBuffer()), titleFromName(file.name)),
          )
          break
        }
        case 'md': {
          await view.open(
            buildMarkdownBook(decodeText(await file.arrayBuffer()), titleFromName(file.name)),
          )
          break
        }
        default:
          await view.open(file)
      }
    } catch (error) {
      throw toAppError(error, ErrorCodes.bookParseFailed)
    }
    this.#applyStyles()
    // The paginator only renders on explicit navigation (kernel contract), so
    // land on the book's reading start; persisted-position restore then
    // navigates again from the UI layer.
    await view.goToTextStart()
  }

  async close(): Promise<void> {
    this.#view?.close()
    this.#annotationCfis.clear()
  }

  async destroy(): Promise<void> {
    await this.close()
    this.#view?.remove()
    this.#view = null
  }

  async getMetadata(): Promise<BookMetadata> {
    const view = this.#requireView()
    const metadata = view.book.metadata ?? {}
    const author = metadata.author
    return {
      title: metadata.title ?? '',
      authors: typeof author === 'string' ? [author] : (author ?? []),
      language:
        typeof metadata.language === 'string'
          ? metadata.language
          : (metadata.language?.[0] ?? undefined),
      publisher: metadata.publisher ?? undefined,
      description: metadata.description ?? undefined,
    }
  }

  async getTableOfContents(): Promise<readonly TocItem[]> {
    const view = this.#requireView()
    const toc = ((await view.book.toc) ?? []) as FoliateTocItem[]
    const mapItems = (items: readonly FoliateTocItem[]): TocItem[] =>
      items
        .filter((item) => typeof item.label === 'string' && item.label.length > 0)
        .map((item) => ({
          id: item.href ?? item.label ?? '',
          title: item.label ?? '',
          ...(item.href !== undefined ? { href: item.href } : {}),
          children: item.subitems ? mapItems(item.subitems) : [],
        }))
    return mapItems(toc)
  }

  async getCurrentLocation(): Promise<ReadingLocation> {
    const view = this.#requireView()
    const last = view.lastLocation
    if (!last) return { progress: 0 }
    return {
      ...(last.cfi !== undefined ? { cfi: last.cfi } : {}),
      progress: last.fraction ?? 0,
    }
  }

  async goTo(location: ReadingLocation): Promise<void> {
    const view = this.#requireView()
    if (location.cfi !== undefined) {
      await view.goTo(location.cfi)
    } else if (location.href !== undefined) {
      await view.goTo(location.href)
    } else {
      await view.goToFraction(location.progress)
    }
  }

  async nextPage(): Promise<void> {
    await this.#requireView().next()
  }

  async previousPage(): Promise<void> {
    await this.#requireView().prev()
  }

  async search(query: string): Promise<readonly SearchResult[]> {
    const view = this.#requireView()
    const trimmed = query.trim()
    if (!trimmed) return []
    const results: SearchResult[] = []
    for await (const item of view.search({ query: trimmed })) {
      if (item === 'done') break
      if ('cfi' in item && item.cfi && item.excerpt) {
        results.push({ location: { cfi: item.cfi, progress: 0 }, excerpt: item.excerpt })
        if (results.length >= MAX_SEARCH_RESULTS) break
      }
    }
    return results
  }

  async getText(range?: TextRange): Promise<string> {
    const view = this.#requireView()
    const cfi = range?.start.cfi
    if (cfi !== undefined) {
      const resolved = view.resolveCFI(cfi)
      const content = view.renderer.getContents().find((x) => x.index === resolved.index)
      if (!content) return ''
      return resolved.anchor(content.doc).toString()
    }
    const content = view.renderer.getContents()[0]
    return content?.doc.body.textContent ?? ''
  }

  async createAnnotation(annotation: Annotation): Promise<void> {
    const cfi = annotation.range.start.cfi
    if (cfi === undefined) {
      throw new AppError(ErrorCodes.systemValidation, '批注缺少 CFI 锚点,无法由内核定位。')
    }
    const view = this.#requireView()
    await view.addAnnotation({ value: cfi, color: annotation.color })
    this.#annotationCfis.set(annotation.id, cfi)
  }

  async removeAnnotation(annotationId: string): Promise<void> {
    const cfi = this.#annotationCfis.get(annotationId)
    if (cfi === undefined) return
    await this.#requireView().deleteAnnotation({ value: cfi })
    this.#annotationCfis.delete(annotationId)
  }

  async setTheme(theme: ReaderTheme): Promise<void> {
    this.#theme = theme
    this.#applyStyles()
  }

  async setLayout(layout: ReaderLayout): Promise<void> {
    const view = this.#requireView()
    if (view.isFixedLayout) return
    view.renderer.setAttribute('flow', layout.flow === 'scrolled' ? 'scrolled' : 'paginated')
    view.renderer.setAttribute('margin', String(layout.margin ?? 48))
    if (layout.fontSize !== undefined) this.#fontSize = layout.fontSize
    this.#applyStyles()
  }
}
