/**
 * Unified logger (spec §53 / §66).
 *
 * Privacy-first by construction:
 * - context values are serialized, size-capped and redacted before reaching sinks
 * - long strings (e.g. book text) are truncated so full content can never leak
 * - keys that look like credentials are replaced with `[redacted]`
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_WEIGHT: Readonly<Record<LogLevel, number>> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

export interface LogRecord {
  readonly time: string
  readonly level: LogLevel
  readonly scope: string
  readonly message: string
  readonly context?: Readonly<Record<string, unknown>>
}

export interface LogSink {
  write(record: LogRecord): void
}

const MAX_MESSAGE_LENGTH = 4000
const MAX_STRING_VALUE_LENGTH = 1000
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_DEPTH = 5

const SENSITIVE_KEY_PATTERN =
  /pass(?:word)?|secret|token|api[-_]?key|credential|authorization|cookie/i

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_OBJECT_DEPTH) return '[max-depth]'
  if (typeof value === 'string') {
    return value.length > MAX_STRING_VALUE_LENGTH
      ? `${value.slice(0, MAX_STRING_VALUE_LENGTH)}…[+${value.length - MAX_STRING_VALUE_LENGTH} chars]`
      : value
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactValue(item, depth + 1))
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message }
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactValue(entry, depth + 1)
    }
    return out
  }
  return value
}

export class ConsoleSink implements LogSink {
  write(record: LogRecord): void {
    if (typeof console === 'undefined') return
    const prefix = `[${record.time}][${record.level.toUpperCase()}][${record.scope}]`
    const method =
      record.level === 'error'
        ? console.error
        : record.level === 'warn'
          ? console.warn
          : console.log
    if (record.context === undefined) {
      method(prefix, record.message)
    } else {
      method(prefix, record.message, record.context)
    }
  }
}

export interface LoggerOptions {
  readonly level?: LogLevel
  readonly sinks?: readonly LogSink[]
}

/** Global registry so sinks/levels are configured once and shared by all loggers. */
class LoggerRegistry {
  private sinks: LogSink[] = [new ConsoleSink()]
  private minWeight: number = LEVEL_WEIGHT.info

  setLevel(level: LogLevel): void {
    this.minWeight = LEVEL_WEIGHT[level]
  }

  getLevel(): LogLevel {
    for (const [level, weight] of Object.entries(LEVEL_WEIGHT) as [LogLevel, number][]) {
      if (weight === this.minWeight) return level
    }
    return 'info'
  }

  setSinks(sinks: readonly LogSink[]): void {
    this.sinks = [...sinks]
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink)
  }

  dispatch(record: LogRecord): void {
    for (const sink of this.sinks) {
      try {
        sink.write(record)
      } catch {
        // A failing sink must never break the application.
      }
    }
  }

  isEnabled(level: LogLevel): boolean {
    return LEVEL_WEIGHT[level] >= this.minWeight
  }
}

const registry = new LoggerRegistry()

export class Logger {
  constructor(private readonly scope: string) {}

  child(name: string): Logger {
    return new Logger(`${this.scope}:${name}`)
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (!registry.isEnabled(level)) return
    registry.dispatch({
      time: new Date().toISOString(),
      level,
      scope: this.scope,
      message: message.length > MAX_MESSAGE_LENGTH ? message.slice(0, MAX_MESSAGE_LENGTH) : message,
      ...(context !== undefined
        ? { context: redactValue(context, 0) as Record<string, unknown> }
        : {}),
    })
  }
}

export function createLogger(scope: string): Logger {
  return new Logger(scope)
}

export function setLogLevel(level: LogLevel): void {
  registry.setLevel(level)
}

export function getLogLevel(): LogLevel {
  return registry.getLevel()
}

export function setLogSinks(sinks: readonly LogSink[]): void {
  registry.setSinks(sinks)
}

export function addLogSink(sink: LogSink): void {
  registry.addSink(sink)
}
