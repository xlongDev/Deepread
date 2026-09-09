import type { FoliateBook } from 'foliate-js/view.js'

export function makePDF(file: File): Promise<FoliateBook>
