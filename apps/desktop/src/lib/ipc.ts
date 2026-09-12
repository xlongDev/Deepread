/**
 * The ONLY place in the frontend allowed to talk to Tauri IPC.
 *
 * Guarantees (spec §40 / §117):
 * - commands and payloads are typed via `CommandMap` / `EventMap` from `@deepread/shared`
 * - responses and event payloads are treated as untrusted input and schema-validated
 * - every failure is normalized to `AppError` — raw rejections never reach the UI
 */

import { invoke as tauriInvoke, Channel } from '@tauri-apps/api/core'
import { listen as tauriListen, type UnlistenFn } from '@tauri-apps/api/event'
import {
  AppError,
  coerceErrorCode,
  createLogger,
  describeCause,
  ErrorCodes,
  eventPayloadValidators,
  jsonRecordFromUnknown,
  toAppError,
  type CommandMap,
  type CommandName,
  type EventMap,
  type EventName,
} from '@deepread/shared'
import { appErrorPayloadSchema, responseValidators } from '@deepread/shared'

const logger = createLogger('ipc')

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function runtimeUnavailableError(): AppError {
  return new AppError(
    ErrorCodes.systemRuntimeUnavailable,
    'Tauri 运行时不可用（当前在浏览器中运行，IPC 无法调用）。',
    { retryable: false },
  )
}

function normalizeIpcError(error: unknown): AppError {
  const parsed = appErrorPayloadSchema.safeParse(error)
  if (parsed.success) {
    const payload = parsed.data
    return new AppError(coerceErrorCode(payload.code), payload.message, {
      cause: payload.cause,
      retryable: payload.retryable,
      context: jsonRecordFromUnknown(payload.context),
    })
  }
  return toAppError(error, ErrorCodes.systemIpcFailed)
}

/** Invoke a backend command with fully typed request and validated response. */
export async function invokeCommand<K extends CommandName>(
  command: K,
  request: CommandMap[K]['request'],
): Promise<CommandMap[K]['response']> {
  if (!isTauriRuntime()) {
    throw runtimeUnavailableError()
  }
  const args = request === undefined ? {} : { request }

  let raw: unknown
  try {
    raw = await tauriInvoke(command, args)
  } catch (error) {
    throw normalizeIpcError(error)
  }

  let response: CommandMap[K]['response']
  try {
    response = responseValidators[command].parse(raw)
  } catch (error) {
    logger.error('response failed schema validation', { command })
    throw new AppError(
      ErrorCodes.securityValidationFailed,
      `命令 "${command}" 的响应未通过 schema 校验。`,
      { cause: error, retryable: false },
    )
  }
  return response
}

/** Subscribe to a backend event with a validated payload. Returns the unlisten function. */
export async function listenEvent<K extends EventName>(
  event: K,
  handler: (payload: EventMap[K]) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    throw runtimeUnavailableError()
  }
  // Tauri event names forbid "."; the transport name replaces it with ":".
  const transportName = event.replaceAll('.', ':')
  return tauriListen<unknown>(transportName, (tauriEvent) => {
    try {
      handler(eventPayloadValidators[event].parse(tauriEvent.payload))
    } catch (error) {
      logger.warn('event payload failed schema validation', {
        event: transportName,
        reason: describeCause(error),
      })
    }
  })
}

/** Stream event shape for channel-based commands (ai.chat). */
export type StreamEvent =
  | { type: 'chunk'; data: string }
  | { type: 'done' }
  | { type: 'cancelled' }
  | { type: 'error'; data: { code: string; message: string; retryable: boolean } }

/**
 * Invoke a streaming command: passes a Tauri Channel the Rust side emits
 * progress on, and returns the command's own (validated) response.
 * Channel payloads are untrusted input — malformed frames are dropped with a
 * logged warning instead of reaching the stream consumer.
 */
export async function invokeStreamingCommand<K extends CommandName>(
  command: K,
  request: CommandMap[K]['request'],
  onEvent: (event: StreamEvent) => void,
): Promise<CommandMap[K]['response']> {
  if (!isTauriRuntime()) {
    throw runtimeUnavailableError()
  }
  const channel = new Channel<Record<string, unknown>>()
  channel.onmessage = (message) => {
    const type = message['type']
    if (type === 'chunk' && typeof message['data'] === 'string') {
      onEvent({ type: 'chunk', data: message['data'] })
    } else if (type === 'done') {
      onEvent({ type: 'done' })
    } else if (type === 'cancelled') {
      onEvent({ type: 'cancelled' })
    } else if (type === 'error') {
      const data = message['data'] as { code?: unknown; message?: unknown; retryable?: unknown }
      onEvent({
        type: 'error',
        data: {
          code: typeof data?.code === 'string' ? data.code : 'AI_PROVIDER_ERROR',
          message:
            typeof data?.message === 'string' ? data.message : 'AI 服务返回了无法解析的错误。',
          retryable: data?.retryable === true,
        },
      })
    } else {
      logger.warn('dropping malformed stream frame', { command, type: String(type) })
    }
  }

  let raw: unknown
  try {
    raw = await tauriInvoke(command, { request, onEvent: channel })
  } catch (error) {
    throw normalizeIpcError(error)
  }

  let response: CommandMap[K]['response']
  try {
    response = responseValidators[command].parse(raw)
  } catch (error) {
    logger.error('streaming command response failed schema validation', { command })
    throw new AppError(
      ErrorCodes.securityValidationFailed,
      `命令 "${command}" 的响应未通过 schema 校验。`,
      { cause: error, retryable: false },
    )
  }
  return response
}
