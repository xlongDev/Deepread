export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}
