import { describe, expect, it } from 'vitest'
import { createSseParser } from './sse'

function collect(chunks: readonly string[]): string[] {
  const out: string[] = []
  const parser = createSseParser((data) => out.push(data))
  for (const chunk of chunks) parser.push(chunk)
  parser.end()
  return out
}

describe('createSseParser', () => {
  it('emits the data payload of complete events', () => {
    expect(collect(['data: {"a":1}\n\ndata: [DONE]\n\n'])).toEqual(['{"a":1}', '[DONE]'])
  })

  it('reassembles events split across network chunks', () => {
    expect(collect(['data: fir', 'st half\n\ndata: se', 'cond\n\n'])).toEqual([
      'first half',
      'second',
    ])
  })

  it('tolerates \\r\\n line endings', () => {
    expect(collect(['data: x\r\n\r\ndata: y\r\n\r\n'])).toEqual(['x', 'y'])
  })

  it('joins multi-line data fields with newline', () => {
    expect(collect(['data: line1\ndata: line2\n\n'])).toEqual(['line1\nline2'])
  })

  it('ignores events without data fields (comments, pings)', () => {
    expect(collect([': ping\n\nevent: keepalive\n\n'])).toEqual([])
  })

  it('flushes a trailing event on end()', () => {
    expect(collect(['data: tail'])).toEqual(['tail'])
  })
})
