import { describe, expect, it } from 'vitest'
import { buildChatBody, chatEndpoint, extractDelta } from './openai'

describe('buildChatBody', () => {
  it('shapes an OpenAI-compatible streaming request', () => {
    const body = JSON.parse(
      buildChatBody({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a reading assistant.' },
          { role: 'user', content: '总结这一章' },
        ],
        temperature: 0.7,
      }),
    ) as { model: string; stream: boolean; temperature: number; messages: unknown[] }
    expect(body.model).toBe('deepseek-chat')
    expect(body.stream).toBe(true)
    expect(body.temperature).toBe(0.7)
    expect(body.messages).toHaveLength(2)
  })

  it('omits temperature when not configured', () => {
    const body = JSON.parse(
      buildChatBody({ model: 'm', messages: [{ role: 'user', content: 'x' }] }),
    ) as Record<string, unknown>
    expect('temperature' in body).toBe(false)
  })
})

describe('chatEndpoint', () => {
  it('appends chat/completions without duplicating slashes', () => {
    expect(chatEndpoint('https://api.deepseek.com/v1')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(chatEndpoint('https://api.deepseek.com/v1/')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
  })
})

describe('extractDelta', () => {
  it('extracts assistant delta text', () => {
    expect(extractDelta('{"choices":[{"delta":{"content":"你好"}}]}')).toEqual({
      type: 'delta',
      text: '你好',
    })
  })

  it('skips empty deltas and role frames', () => {
    expect(extractDelta('{"choices":[{"delta":{"role":"assistant"}}]}')).toEqual({
      type: 'skip',
    })
    expect(extractDelta('{"choices":[]}')).toEqual({ type: 'skip' })
  })

  it('reports done and skips unparseable payloads', () => {
    expect(extractDelta('[DONE]')).toEqual({ type: 'done' })
    expect(extractDelta('not json')).toEqual({ type: 'skip' })
  })
})
