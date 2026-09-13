/**
 * Copies PDF.js support assets (CJK cmaps + standard fonts) from the
 * pdfjs-dist package into the app's public directory. Chinese PDFs cannot
 * render text without cmaps — white pages otherwise.
 *
 * Runs automatically on pnpm install (root "postinstall"). Idempotent:
 * skipped when the assets are already present.
 */
import { existsSync, cpSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(repoRoot, 'packages/reader-adapter/node_modules/pdfjs-dist')
const dest = join(repoRoot, 'apps/desktop/public/pdfjs')

if (!existsSync(source)) {
  console.log('[copy-pdfjs-assets] pdfjs-dist not installed yet — skipping')
} else if (existsSync(join(dest, 'cmaps'))) {
  console.log('[copy-pdfjs-assets] already present — skipping')
} else {
  cpSync(join(source, 'cmaps'), join(dest, 'cmaps'), { recursive: true })
  cpSync(join(source, 'standard_fonts'), join(dest, 'standard_fonts'), { recursive: true })
  console.log(`[copy-pdfjs-assets] copied cmaps + standard_fonts to ${dest}`)
}
