import type { FoliateBook } from 'foliate-js/view.js'

export class MOBI {
  constructor(options: { unzlib: (data: Uint8Array) => Uint8Array })
  open(file: Blob): Promise<FoliateBook>
}
