/**
 * OpenAI-compatible chat stream shaping: request body construction and
 * stream-event → text-delta extraction. Shared by every OpenAI-compatible
 * provider (OpenAI, DeepSeek, Qwen, Kimi, Zhipu, MiniMax, Ollama).
 */

import type { ChatMessage } from './types'

export interface ChatRequestBody {
  readonly model: string
  readonly messages: readonly ChatMessage[]
  readonly stream: true
  readonly temperature?: number
}

export function buildChatBody(options: {
  model: string
  messages: readonly ChatMessage[]
  temperature?: number
}): string {
  const body: ChatRequestBody = {
    model: options.model,
    messages: options.messages,
    stream: true,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  }
  return JSON.stringify(body)
}

/** chat completions endpoint for a configured base URL. */
export function chatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
}

/**
 * Extract the assistant text delta from one SSE `data:` payload.
 * Returns null for non-chat payloads (usage frames, comments) and
 * '[DONE]' terminators are reported as done.
 */
export function extractDelta(
  data: string,
): { type: 'delta'; text: string } | { type: 'done' } | { type: 'skip' } {
  if (data === '[DONE]') return { type: 'done' }
  try {
    const parsed = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null } }[]
    }
    const text = parsed.choices?.[0]?.delta?.content
    return typeof text === 'string' && text.length > 0 ? { type: 'delta', text } : { type: 'skip' }
  } catch {
    return { type: 'skip' }
  }
}
