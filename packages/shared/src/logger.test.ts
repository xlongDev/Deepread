import { afterEach, describe, expect, it } from 'vitest'
import {
  addLogSink,
  createLogger,
  getLogLevel,
  setLogLevel,
  setLogSinks,
  type LogRecord,
} from './logger'

class RecordingSink {
  readonly records: LogRecord[] = []

  write(record: LogRecord): void {
    this.records.push(record)
  }
}

function withSinks(run: (sink: RecordingSink) => void): void {
  const sink = new RecordingSink()
  setLogSinks([sink])
  try {
    run(sink)
  } finally {
    setLogLevel('info')
  }
}

afterEach(() => {
  setLogSinks([])
})

describe('logger', () => {
  it('filters records below the configured level', () => {
    withSinks((sink) => {
      setLogLevel('warn')
      const logger = createLogger('test')
      logger.debug('hidden')
      logger.info('hidden too')
      logger.warn('shown')
      expect(sink.records.map((r) => r.message)).toEqual(['shown'])
    })
  })

  it('scopes loggers with child() and stamps level/scope/time', () => {
    withSinks((sink) => {
      const logger = createLogger('ipc').child('invoke')
      logger.info('hello', { command: 'system.ping' })
      const record = sink.records[0]
      expect(record).toBeDefined()
      expect(record?.scope).toBe('ipc:invoke')
      expect(record?.level).toBe('info')
      expect(record?.time).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(record?.context).toEqual({ command: 'system.ping' })
    })
  })

  it('redacts sensitive context keys', () => {
    withSinks((sink) => {
      const logger = createLogger('ai')
      logger.info('calling provider', {
        apiKey: 'sk-secret',
        token: 'jwt-value',
        password: 'hunter2',
        model: 'test-model',
      })
      const context = sink.records[0]?.context as Record<string, unknown>
      expect(context['apiKey']).toBe('[redacted]')
      expect(context['token']).toBe('[redacted]')
      expect(context['password']).toBe('[redacted]')
      expect(context['model']).toBe('test-model')
    })
  })

  it('truncates oversized strings so book text cannot leak into logs', () => {
    withSinks((sink) => {
      const logger = createLogger('reader')
      const bookText = 'a'.repeat(5000)
      logger.info('selection', { text: bookText })
      const context = sink.records[0]?.context as Record<string, unknown>
      const stored = context['text'] as string
      expect(stored.length).toBeLessThan(1100)
      expect(stored).toContain('[+4000 chars]')
    })
  })

  it('survives a failing sink', () => {
    const failing = {
      write(): void {
        throw new Error('sink exploded')
      },
    }
    const sink = new RecordingSink()
    setLogSinks([failing, sink])
    const logger = createLogger('test')
    expect(() => logger.error('still delivered')).not.toThrow()
    expect(sink.records).toHaveLength(1)
  })

  it('round-trips the log level', () => {
    setLogLevel('debug')
    expect(getLogLevel()).toBe('debug')
    setLogLevel('error')
    expect(getLogLevel()).toBe('error')
    setLogLevel('info')
  })

  it('caps message length', () => {
    withSinks((sink) => {
      createLogger('test').info('x'.repeat(10_000))
      expect((sink.records[0]?.message ?? '').length).toBeLessThanOrEqual(4000)
    })
  })
})

describe('addLogSink', () => {
  it('keeps existing sinks when adding one', () => {
    const first = new RecordingSink()
    const second = new RecordingSink()
    setLogSinks([first])
    addLogSink(second)
    createLogger('test').warn('fan-out')
    expect(first.records).toHaveLength(1)
    expect(second.records).toHaveLength(1)
  })
})
