/**
 * MOBI/AZW3 books via the vendored foliate MOBI parser (see
 * `vendor/foliate-mobi.js` for why it is vendored).
 */

import { unzlibSync } from './vendor/fflate.js'
import { MOBI } from './vendor/foliate-mobi.js'
import type { FoliateBook } from 'foliate-js/view.js'

export async function buildMobiBook(file: File): Promise<FoliateBook> {
  return new MOBI({ unzlib: unzlibSync }).open(file)
}
