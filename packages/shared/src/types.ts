/**
 * Primitive, dependency-light types shared across every layer.
 *
 * Persistence is out of scope in Phase 0 — these types define the shape that
 * Storage (Sprint 3) will persist, so domains can already model against them.
 */

/** ISO 8601 timestamp string, e.g. `2026-09-08T12:34:56.789Z`. */
export type ISO8601 = string

/** Base shape every persisted entity must satisfy (spec §14). */
export interface EntityBase {
  readonly id: string
  readonly createdAt: ISO8601
  readonly updatedAt: ISO8601
  /** Monotonic per-entity counter for optimistic concurrency. */
  readonly version: number
}

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type JsonRecord = { readonly [key: string]: JsonValue }

export const ISO8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export function isISO8601(value: string): boolean {
  return ISO8601_PATTERN.test(value)
}

/** Convert an unknown value into a JSON-safe value, or `undefined` when it cannot be represented. */
export function jsonValueFromUnknown(value: unknown, depth = 0): JsonValue | undefined {
  if (depth > 8) return '[max-depth]'
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => jsonValueFromUnknown(item, depth + 1))
      .filter((item): item is JsonValue => item !== undefined)
  }
  if (typeof value === 'object') {
    const record: { [key: string]: JsonValue } = {}
    for (const [key, entry] of Object.entries(value)) {
      const converted = jsonValueFromUnknown(entry, depth + 1)
      if (converted !== undefined) record[key] = converted
    }
    return record
  }
  return undefined
}

/** Convert an unknown record-like value into a JSON record, or `undefined` when it is not one. */
export function jsonRecordFromUnknown(value: unknown): JsonRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record: { [key: string]: JsonValue } = {}
  for (const [key, entry] of Object.entries(value)) {
    const converted = jsonValueFromUnknown(entry)
    if (converted !== undefined) record[key] = converted
  }
  return record
}
