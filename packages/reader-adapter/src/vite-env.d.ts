/**
 * Build-time asset import declarations (mirrors Vite's `vite/client` types,
 * declared locally so this package does not need Vite as a dependency) plus
 * the `globalThis.pdfjsLib` slot the vendored foliate PDF adapter reads.
 */
declare module '*?inline' {
  const content: string
  export default content
}

var pdfjsLib: typeof import('pdfjs-dist') | undefined
