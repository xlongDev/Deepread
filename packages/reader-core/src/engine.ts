/**
 * ReaderEngine — the single contract between the business layer and any
 * reading kernel (spec §6 / §7).
 *
 * The business layer depends ONLY on this interface. foliate-js specifics are
 * isolated inside the FoliateAdapter (Phase 1), so the kernel can be replaced
 * without touching the product.
 */

import type {
  Annotation,
  BookMetadata,
  BookSource,
  ReaderLayout,
  ReaderTheme,
  ReadingLocation,
  SearchResult,
  TextRange,
  TocItem,
} from './types'

export interface ReaderEngine {
  open(source: BookSource): Promise<void>
  close(): Promise<void>

  getMetadata(): Promise<BookMetadata>
  getTableOfContents(): Promise<readonly TocItem[]>

  getCurrentLocation(): Promise<ReadingLocation>
  goTo(location: ReadingLocation): Promise<void>
  nextPage(): Promise<void>
  previousPage(): Promise<void>

  search(query: string): Promise<readonly SearchResult[]>
  getText(range?: TextRange): Promise<string>

  createAnnotation(annotation: Annotation): Promise<void>
  removeAnnotation(annotationId: string): Promise<void>

  setTheme(theme: ReaderTheme): Promise<void>
  setLayout(layout: ReaderLayout): Promise<void>

  destroy(): Promise<void>
}
