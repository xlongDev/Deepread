import { describe, expect, it } from 'vitest'
import { appErrorPayloadSchema } from './protocol/errors'
import {
  appInfoSchema,
  COMMAND,
  requestValidators,
  responseValidators,
  systemPingRequestSchema,
  systemPingResponseSchema,
} from './protocol/commands'
import { EVENT, eventPayloadValidators } from './protocol/events'

describe('command validators', () => {
  it('every command has a response validator', () => {
    for (const command of Object.values(COMMAND)) {
      expect(responseValidators[command], `missing validator for ${command}`).toBeDefined()
    }
  })

  it('systemPingRequestSchema accepts a valid nonce', () => {
    expect(systemPingRequestSchema.safeParse({ nonce: 'abc' }).success).toBe(true)
  })

  it('systemPingRequestSchema rejects an empty or oversized nonce', () => {
    expect(systemPingRequestSchema.safeParse({ nonce: '' }).success).toBe(false)
    expect(systemPingRequestSchema.safeParse({ nonce: 'x'.repeat(129) }).success).toBe(false)
  })

  it('systemPingResponseSchema rejects a non-ISO serverTime', () => {
    const bad = { nonce: 'abc', serverTime: 'yesterday', appVersion: '0.1.0' }
    expect(systemPingResponseSchema.safeParse(bad).success).toBe(false)
    const good = { nonce: 'abc', serverTime: '2026-09-08T12:00:00.123Z', appVersion: '0.1.0' }
    expect(systemPingResponseSchema.safeParse(good).success).toBe(true)
  })

  it('appInfoSchema requires all fields', () => {
    expect(
      appInfoSchema.safeParse({ appName: 'Deepread', appVersion: '0.1.0', os: 'macos' }).success,
    ).toBe(false)
    expect(
      appInfoSchema.safeParse({
        appName: 'Deepread',
        appVersion: '0.1.0',
        os: 'macos',
        arch: 'aarch64',
      }).success,
    ).toBe(true)
  })

  it('request validators exist for commands that take a request', () => {
    expect(requestValidators[COMMAND.systemPing]).toBeDefined()
    expect(requestValidators[COMMAND.appInfo]).toBeUndefined()
  })
})

describe('event validators', () => {
  it('validates the app.ready payload', () => {
    const good = { startedAt: '2026-09-08T12:00:00Z', appVersion: '0.1.0' }
    expect(eventPayloadValidators[EVENT.appReady].parse(good)).toEqual(good)

    const bad = { startedAt: 'now', appVersion: '0.1.0' }
    expect(() => eventPayloadValidators[EVENT.appReady].parse(bad)).toThrow()
  })
})

describe('appErrorPayloadSchema', () => {
  it('accepts a Rust-produced error payload', () => {
    const payload = {
      code: 'SYSTEM_VALIDATION',
      message: 'nonce must not be empty',
      retryable: false,
      context: { field: 'nonce' },
    }
    expect(appErrorPayloadSchema.safeParse(payload).success).toBe(true)
  })

  it('rejects payloads without a retryable flag', () => {
    const payload = { code: 'SYSTEM_VALIDATION', message: 'x' }
    expect(appErrorPayloadSchema.safeParse(payload).success).toBe(false)
  })
})
