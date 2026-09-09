/**
 * Wire format of `AppError` as produced by the Rust core.
 * Used to validate/normalize errors that cross the IPC boundary.
 */

import { z } from 'zod'

export const appErrorPayloadSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  cause: z.string().optional(),
  retryable: z.boolean(),
  context: z.record(z.string(), z.unknown()).optional(),
})

export type WireAppErrorPayload = z.output<typeof appErrorPayloadSchema>
