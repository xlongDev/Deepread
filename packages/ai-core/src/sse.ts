/**
 * Incremental SSE parser for OpenAI-compatible chat streams. Feed raw network
 * chunks; it emits the `data:` payload of every complete event and tolerates
 * events split across chunks (`\r\n` included).
 */

export interface SseParser {
  push(chunk: string): void
  end(): void
}

export function createSseParser(onData: (data: string) => void): SseParser {
  let buffer = ''
  return {
    push(chunk: string): void {
      buffer += chunk
      let boundary = buffer.search(/\r?\n\r?\n/)
      while (boundary !== -1) {
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + (buffer[boundary] === '\r' ? 4 : 2))
        const data = extractData(event)
        if (data !== null) onData(data)
        boundary = buffer.search(/\r?\n\r?\n/)
      }
    },
    end(): void {
      const data = extractData(buffer)
      if (data !== null) onData(data)
      buffer = ''
    },
  }
}

function extractData(event: string): string | null {
  const lines = event.split(/\r?\n/).filter((line) => line.startsWith('data:'))
  if (lines.length === 0) return null
  return lines.map((line) => line.slice(5).trimStart()).join('\n')
}
