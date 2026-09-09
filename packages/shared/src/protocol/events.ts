/**
 * Typed IPC event catalog (Phase 0).
 *
 * Rules (spec §41 / §59):
 * - every event has a logical name (`app.ready`), a schema version and a payload type
 * - Tauri event names forbid `.`, so the transport name replaces `.` with `:`
 *   (`app.ready` → `app:ready`); the mapping lives in the two boundary helpers
 *   (`apps/desktop/src/lib/ipc.ts` and `src-tauri/src/events.rs`)
 * - payloads are untrusted input and are validated before they reach handlers
 */

import { z } from 'zod'
import { ISO8601_PATTERN, type ISO8601 } from '../types'

export const EVENT = {
  appReady: 'app.ready',
} as const

export const PROTOCOL_VERSION = 1

export interface AppReadyPayload {
  readonly startedAt: ISO8601
  readonly appVersion: string
}

/** The single source of truth for event payload shapes. */
export interface EventMap {
  [EVENT.appReady]: AppReadyPayload
}

export type EventName = keyof EventMap

export interface EventEnvelope<P> {
  readonly name: EventName
  readonly version: typeof PROTOCOL_VERSION
  readonly payload: P
}

export interface EventValidator<P> {
  parse(value: unknown): P
}

export const eventPayloadValidators: { [K in EventName]: EventValidator<EventMap[K]> } = {
  [EVENT.appReady]: z.object({
    startedAt: z.string().regex(ISO8601_PATTERN, 'must be an ISO 8601 timestamp'),
    appVersion: z.string().min(1),
  }),
}
