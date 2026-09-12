/**
 * AI provider configuration validation (zod) — the non-secret half. API keys
 * live in the OS keychain via the Rust side and are addressed by config id.
 */

import { z } from 'zod'

export const aiProviderConfigSchema = z.object({
  id: z.string().min(8).max(64),
  name: z.string().min(1).max(64),
  baseUrl: z.string().url().max(512),
  model: z.string().min(1).max(128),
})

export type AiProviderConfigWire = z.output<typeof aiProviderConfigSchema>

export const aiConfigListResponseSchema = z.object({
  providers: z.array(aiProviderConfigSchema).max(100),
})

export const aiConfigSaveRequestSchema = z.object({
  provider: aiProviderConfigSchema,
  apiKey: z.string().max(512),
})

export const aiConfigRemoveRequestSchema = z.object({ id: z.string().min(8).max(64) })

export const aiChatRequestSchema = z.object({
  taskId: z.string().min(8).max(64),
  configId: z.string().min(8).max(64),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string().max(100_000),
      }),
    )
    .min(1)
    .max(100),
  temperature: z.number().min(0).max(2).optional(),
})
