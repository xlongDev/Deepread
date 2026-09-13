/**
 * AI-assisted text correction (spec §35 AI Book Processor, MVP scope).
 *
 * Safety model: the model never rewrites the book. It proposes *targeted*
 * find/replace corrections; every proposal is validated against the real
 * text (exact occurrence count) before it can be shown, and application
 * happens only for user-accepted items on verified-unique matches.
 */

import { z } from 'zod'

export interface AiCorrection {
  readonly id: string
  readonly find: string
  readonly replace: string
  readonly reason: string
  /** How many times `find` occurs in the source text (0 → invalid, dropped). */
  readonly occurrences: number
}

const correctionsSchema = z.object({
  corrections: z
    .array(
      z.object({
        find: z.string().min(1).max(500),
        replace: z.string().max(500),
        reason: z.string().max(500),
      }),
    )
    .max(100),
})

export type CorrectionsPayload = z.output<typeof correctionsSchema>

/** Prompt asking the model for targeted corrections on a bounded excerpt. */
export function buildRepairMessages(
  excerpt: string,
  title: string,
): readonly { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content: [
        `你是中文电子书校对助手。以下是《${title}》的正文片段。`,
        '只找确定的错误:错别字、明显多余或缺失的标点、全半角混乱。不要改写风格,不要重写句子。',
        '输出严格 JSON(无其他文字):',
        '{"corrections":[{"find":"原文中连续的一段原文","replace":"替换后的文字","reason":"错误原因"}]}',
        'find 必须逐字出现在原文中且尽量短而唯一;没有错误就返回 {"corrections":[]}。',
      ].join('\n'),
    },
    { role: 'user', content: excerpt },
  ]
}

/** Validate raw model output and anchor each correction in the real text. */
export function parseCorrections(text: string, source: string): readonly AiCorrection[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const candidate = (fenced?.[1] ?? text).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end <= start) return []
  const parsed = correctionsSchema.safeParse(JSON.parse(candidate.slice(start, end + 1)))
  if (!parsed.success) return []

  const result: AiCorrection[] = []
  for (const correction of parsed.data.corrections) {
    const occurrences = countOccurrences(source, correction.find)
    if (occurrences === 0) continue
    if (correction.find === correction.replace) continue
    result.push({
      id: `ai-${result.length}-${hash(correction.find + correction.replace)}`,
      find: correction.find,
      replace: correction.replace,
      reason: correction.reason,
      occurrences,
    })
  }
  return result
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0
  let count = 0
  let position = haystack.indexOf(needle)
  while (position !== -1) {
    count++
    position = haystack.indexOf(needle, position + needle.length)
  }
  return count
}

function hash(text: string): string {
  let value = 0
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) | 0
  }
  return (value >>> 0).toString(36)
}

/** Apply only accepted corrections whose find is unique in the text. */
export function applyCorrections(
  text: string,
  corrections: readonly AiCorrection[],
  acceptedIds: readonly string[],
): { readonly text: string; readonly applied: number; readonly skipped: number } {
  const accepted = new Set(acceptedIds)
  let output = text
  let applied = 0
  let skipped = 0
  for (const correction of corrections) {
    if (!accepted.has(correction.id)) continue
    // Re-verify against the *current* text: earlier replacements may have
    // consumed or altered overlapping matches.
    const occurrences = countOccurrences(output, correction.find)
    if (occurrences !== 1) {
      skipped++
      continue
    }
    output = output.replace(correction.find, correction.replace)
    applied++
  }
  return { text: output, applied, skipped }
}
