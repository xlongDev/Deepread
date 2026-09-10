/**
 * MOBI/AZW3 books via the kernel's own MOBI parser (foliate-js/mobi.js),
 * which needs PDF.js-style `unzlib`; fflate ships beside the kernel.
 */

import { MOBI } from 'foliate-js/mobi.js'
import { unzlibSync } from 'foliate-js/vendor/fflate.js'
import type { FoliateBook } from 'foliate-js/view.js'

export async function buildMobiBook(file: File): Promise<FoliateBook> {
  return new MOBI({ unzlib: unzlibSync }).open(file)
}
