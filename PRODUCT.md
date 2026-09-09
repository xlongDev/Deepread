# PRODUCT.md

## What this is

Deepread: a local-first, cross-platform ebook reader (desktop first: macOS/Windows/Linux via Tauri 2) where a best-in-class reading experience comes first and AI features (later phases) only enhance it. Target users read EPUB/PDF/TXT/MD (plus MOBI/AZW3/FB2/CBZ) for long sessions, in Chinese and English.

## Non-negotiables

- Reading performance and stability outrank every other quality.
- Original book content is never modified; AI output is always reviewable (later phases).
- Local-first and privacy-first; no telemetry of reading content.
- foliate-js is the only rendering kernel; the app never re-flows or transcodes book text.

## Surfaces (current)

1. **Library (home)**: import books (file picker + drag & drop), open a book. Empty state teaches import. Later: shelf, progress, search.
2. **Reader**: paginated or scrolled reading with original typography preserved; TOC sidebar; progress slider; prev/next; reading theme (light/sepia/dark) and font controls; text selection produces a toolbar (copy, highlight); highlights/annotations anchored by CFI and persisted per book.

## Success for the visitor (Operate mode)

Open a book in under 2 seconds from the library; read without the interface getting in the way (chrome auto-hides, keyboard and click zones work); resume exactly where they left off; highlight a passage in one action.
