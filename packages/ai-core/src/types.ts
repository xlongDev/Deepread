/**
 * AI domain types (spec §5.9 / §28-31). The provider contract is
 * transport-agnostic: the desktop app wires it to a Rust-proxied streaming
 * transport so API keys never reach the webview.
 */

import type { EntityBase } from '@deepread/shared'

/** Configuration for an OpenAI-compatible chat provider. Never holds the key. */
export interface AiProviderConfig extends EntityBase {
  readonly name: string
  /** e.g. https://api.deepseek.com/v1 (no trailing slash). */
  readonly baseUrl: string
  readonly model: string
}

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  readonly role: ChatRole
  readonly content: string
}

/** One streamed reply. `done` marks the end of the stream. */
export type ChatEvent =
  | { readonly type: 'delta'; readonly text: string }
  | { readonly type: 'done' }
  | { readonly type: 'error'; readonly message: string }

/** Transport the UI provides: sends one chat request, yields stream events. */
export type ChatTransport = (
  request: ChatRequestPayload,
  handlers: {
    onEvent: (event: ChatEvent) => void
  },
) => Promise<void>

export interface ChatRequestPayload {
  readonly configId: string
  readonly taskId: string
  readonly messages: readonly ChatMessage[]
  readonly temperature?: number
}
