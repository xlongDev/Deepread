/**
 * Typed IPC command catalog.
 *
 * Rules (spec §40 / §57):
 * - every command has a name, request type, response type and error type (`AppErrorPayload`)
 * - responses are untrusted input: the frontend validates them with the schemas below
 * - requests are validated on the Rust side by typed serde structs + explicit checks
 * - Sprint 2 replaces the hand-mirrored Rust types with schema-first codegen
 */

import { z } from 'zod'
import { ISO8601_PATTERN, type ISO8601 } from '../types'

export const COMMAND = {
  systemPing: 'system.ping',
  appInfo: 'app.info',
  readerStateGet: 'reader.state.get',
  readerStateSet: 'reader.state.set',
  libraryList: 'library.list',
  libraryImport: 'library.import',
  libraryRemove: 'library.remove',
  dictionaryList: 'dictionary.list',
  dictionaryRegister: 'dictionary.register',
  dictionaryRemove: 'dictionary.remove',
  aiConfigList: 'ai.config.list',
  aiConfigSave: 'ai.config.save',
  aiConfigRemove: 'ai.config.remove',
  aiChat: 'ai.chat',
  aiCancel: 'ai.cancel',
  aiEmbed: 'ai.embed',
  aiIndexGet: 'ai.index.get',
  aiIndexSet: 'ai.index.set',
  secretSet: 'secret.set',
  secretGet: 'secret.get',
  secretDelete: 'secret.delete',
} as const

export interface SystemPingRequest {
  readonly nonce: string
}

export interface SystemPingResponse {
  readonly nonce: string
  readonly serverTime: ISO8601
  readonly appVersion: string
}

export interface AppInfo {
  readonly appName: string
  readonly appVersion: string
  readonly os: string
  readonly arch: string
}

/** One persisted highlight/annotation, anchored by CFI (kernel-level locator). */
export interface AnnotationRecord {
  readonly id: string
  readonly cfi: string
  readonly color: string
  readonly note?: string
  readonly excerpt?: string
}

/** One bookmark: a named CFI anchor in the book. */
export interface BookmarkRecord {
  readonly id: string
  readonly cfi: string
  readonly label?: string
  readonly createdAt: ISO8601
}

/** Per-book reader state, persisted keyed by the hash of the book file. */
export interface ReaderStatePayload {
  readonly progress: { readonly cfi: string; readonly fraction: number } | null
  readonly annotations: readonly AnnotationRecord[]
  readonly bookmarks: readonly BookmarkRecord[]
  readonly updatedAt: ISO8601
}

/**
 * A book registered in the library. The file stays at its original location
 * (spec: original content is never moved or modified); it is served to the
 * reader kernel through the asset protocol.
 */
export interface LibraryBook {
  readonly hash: string
  readonly fileName: string
  readonly format: string
  readonly path: string
  readonly size: number
  readonly addedAt: ISO8601
}

export interface LibraryListResponse {
  readonly books: readonly LibraryBook[]
}

export interface LibraryImportRequest {
  readonly path: string
}

export interface LibraryImportResponse {
  readonly book: LibraryBook
}

export interface LibraryRemoveRequest {
  readonly bookHash: string
}

export interface LibraryRemoveResponse {
  readonly removed: boolean
}

/** A registered StarDict dictionary (files stay at their original location). */
export interface DictionaryMeta {
  readonly id: string
  readonly name: string
  readonly wordCount: number
  readonly sametypesequence?: string
  readonly ifoPath: string
  readonly idxPath: string
  readonly dictPath: string
}

export interface DictionaryListResponse {
  readonly dictionaries: readonly DictionaryMeta[]
}

export interface DictionaryRegisterRequest {
  readonly path: string
}

export interface DictionaryRegisterResponse {
  readonly dictionary: DictionaryMeta
}

export interface DictionaryRemoveRequest {
  readonly id: string
}

export interface DictionaryRemoveResponse {
  readonly removed: boolean
}

/**
 * AI provider configuration (non-secret half). The API key lives in the OS
 * keychain, addressed by the config id — it never crosses IPC back to the UI.
 */
export interface AiProviderConfig {
  readonly id: string
  readonly name: string
  readonly baseUrl: string
  readonly model: string
  /** Embedding model for RAG; defaults to the chat model when absent. */
  readonly embeddingModel?: string
}

export interface AiConfigListResponse {
  readonly providers: readonly AiProviderConfig[]
}

export interface AiConfigSaveRequest {
  readonly provider: AiProviderConfig
  readonly apiKey: string
}

export interface AiConfigSaveResponse {
  readonly provider: AiProviderConfig
}

export interface AiConfigRemoveRequest {
  readonly id: string
}

export interface AiConfigRemoveResponse {
  readonly removed: boolean
}

export interface AiChatRequest {
  readonly taskId: string
  readonly configId: string
  /** OpenAI-compatible chat messages (validated by zod on the sender side). */
  readonly messages: readonly {
    readonly role: 'system' | 'user' | 'assistant'
    readonly content: string
  }[]
  readonly temperature?: number
}

/** ai.chat returns the taskId immediately; stream events arrive via channel. */
export interface AiChatResponse {
  readonly taskId: string
}

export interface AiCancelRequest {
  readonly taskId: string
}

export interface AiCancelResponse {
  readonly cancelled: boolean
}

export interface AiEmbedRequest {
  readonly taskId: string
  readonly configId: string
  readonly texts: readonly string[]
}

export interface AiEmbedResponse {
  readonly vectors: readonly (readonly number[])[]
}

/** One indexed chunk of a book (chapter-labeled, embedded). */
export interface AiIndexChunk {
  readonly label: string
  readonly text: string
  readonly vector: readonly number[]
}

export interface AiIndexPayload {
  readonly chunks: readonly AiIndexChunk[]
  readonly embeddingModel: string
  readonly createdAt: ISO8601
}

export interface AiIndexGetRequest {
  readonly bookHash: string
}

export interface AiIndexGetResponse {
  readonly index: AiIndexPayload | null
}

export interface AiIndexSetRequest {
  readonly bookHash: string
  readonly index: AiIndexPayload
}

export interface AiIndexSetResponse {
  readonly savedAt: ISO8601
}

export interface SecretSetRequest {
  readonly key: string
  readonly value: string
}

export interface SecretGetRequest {
  readonly key: string
}

export interface SecretGetResponse {
  readonly value: string | null
}

export interface SecretDeleteRequest {
  readonly key: string
}

export interface SecretDeleteResponse {
  readonly deleted: boolean
}

export interface ReaderStateGetRequest {
  readonly bookHash: string
}

export interface ReaderStateGetResponse {
  readonly state: ReaderStatePayload | null
}

export interface ReaderStateSetRequest {
  readonly bookHash: string
  readonly state: ReaderStatePayload
}

export interface ReaderStateSetResponse {
  readonly savedAt: ISO8601
}

/** The single source of truth for command request/response shapes. */
export interface CommandMap {
  [COMMAND.systemPing]: {
    readonly request: SystemPingRequest
    readonly response: SystemPingResponse
  }
  [COMMAND.appInfo]: {
    readonly request: undefined
    readonly response: AppInfo
  }
  [COMMAND.readerStateGet]: {
    readonly request: ReaderStateGetRequest
    readonly response: ReaderStateGetResponse
  }
  [COMMAND.readerStateSet]: {
    readonly request: ReaderStateSetRequest
    readonly response: ReaderStateSetResponse
  }
  [COMMAND.libraryList]: {
    readonly request: undefined
    readonly response: LibraryListResponse
  }
  [COMMAND.libraryImport]: {
    readonly request: LibraryImportRequest
    readonly response: LibraryImportResponse
  }
  [COMMAND.libraryRemove]: {
    readonly request: LibraryRemoveRequest
    readonly response: LibraryRemoveResponse
  }
  [COMMAND.dictionaryList]: {
    readonly request: undefined
    readonly response: DictionaryListResponse
  }
  [COMMAND.dictionaryRegister]: {
    readonly request: DictionaryRegisterRequest
    readonly response: DictionaryRegisterResponse
  }
  [COMMAND.dictionaryRemove]: {
    readonly request: DictionaryRemoveRequest
    readonly response: DictionaryRemoveResponse
  }
  [COMMAND.aiConfigList]: {
    readonly request: undefined
    readonly response: AiConfigListResponse
  }
  [COMMAND.aiConfigSave]: {
    readonly request: AiConfigSaveRequest
    readonly response: AiConfigSaveResponse
  }
  [COMMAND.aiConfigRemove]: {
    readonly request: AiConfigRemoveRequest
    readonly response: AiConfigRemoveResponse
  }
  /** ai.chat streams events through a Tauri Channel, not the return value. */
  [COMMAND.aiChat]: {
    readonly request: AiChatRequest
    readonly response: AiChatResponse
  }
  [COMMAND.aiCancel]: {
    readonly request: AiCancelRequest
    readonly response: AiCancelResponse
  }
  [COMMAND.aiEmbed]: {
    readonly request: AiEmbedRequest
    readonly response: AiEmbedResponse
  }
  [COMMAND.aiIndexGet]: {
    readonly request: AiIndexGetRequest
    readonly response: AiIndexGetResponse
  }
  [COMMAND.aiIndexSet]: {
    readonly request: AiIndexSetRequest
    readonly response: AiIndexSetResponse
  }
  [COMMAND.secretSet]: {
    readonly request: { readonly key: string; readonly value: string }
    readonly response: { readonly deleted: boolean }
  }
  [COMMAND.secretGet]: {
    readonly request: { readonly key: string }
    readonly response: { readonly value: string | null }
  }
  [COMMAND.secretDelete]: {
    readonly request: { readonly key: string }
    readonly response: { readonly deleted: boolean }
  }
}

export type CommandName = keyof CommandMap

const iso8601 = z.string().regex(ISO8601_PATTERN, 'must be an ISO 8601 timestamp')

export const systemPingRequestSchema = z.object({
  nonce: z.string().min(1).max(128),
})

export const systemPingResponseSchema = z.object({
  nonce: z.string().min(1),
  serverTime: iso8601,
  appVersion: z.string().min(1),
})

export const appInfoSchema = z.object({
  appName: z.string().min(1),
  appVersion: z.string().min(1),
  os: z.string().min(1),
  arch: z.string().min(1),
})

/** Book file hashes are lowercase SHA-256 hex strings (frontend computes via WebCrypto). */
const bookHash = z.string().regex(/^[a-f0-9]{64}$/, 'must be a SHA-256 hex digest')

const annotationRecordSchema = z.object({
  id: z.string().min(1).max(128),
  cfi: z.string().min(1).max(2048),
  color: z.string().min(1).max(32),
  note: z.string().max(4000).optional(),
  excerpt: z.string().max(2000).optional(),
})

const readerStatePayloadSchema = z.object({
  progress: z
    .object({ cfi: z.string().min(1).max(2048), fraction: z.number().min(0).max(1) })
    .nullable(),
  annotations: z.array(annotationRecordSchema).max(10_000),
  bookmarks: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        cfi: z.string().min(1).max(2048),
        label: z.string().max(200).optional(),
        createdAt: iso8601,
      }),
    )
    .max(2000),
  updatedAt: iso8601,
})

const libraryBookSchema = z.object({
  hash: bookHash,
  fileName: z.string().min(1).max(512),
  format: z.string().min(1).max(16),
  path: z.string().min(1).max(4096),
  size: z.number().int().min(0),
  addedAt: iso8601,
})

export const readerStateGetRequestSchema = z.object({ bookHash })
export const readerStateGetResponseSchema = z.object({
  state: readerStatePayloadSchema.nullable(),
})
export const readerStateSetRequestSchema = z.object({
  bookHash,
  state: readerStatePayloadSchema,
})
export const readerStateSetResponseSchema = z.object({ savedAt: iso8601 })

export const libraryListResponseSchema = z.object({ books: z.array(libraryBookSchema).max(10_000) })
export const libraryImportRequestSchema = z.object({ path: z.string().min(1).max(4096) })
export const libraryImportResponseSchema = z.object({ book: libraryBookSchema })
export const libraryRemoveRequestSchema = z.object({ bookHash: bookHash })
export const libraryRemoveResponseSchema = z.object({ removed: z.boolean() })

const dictionaryMetaSchema = z.object({
  id: z.string().min(8).max(64),
  name: z.string().min(1).max(256),
  wordCount: z.number().int().min(0),
  sametypesequence: z.string().max(16).optional(),
  ifoPath: z.string().min(1).max(4096),
  idxPath: z.string().min(1).max(4096),
  dictPath: z.string().min(1).max(4096),
})

export const dictionaryListResponseSchema = z.object({
  dictionaries: z.array(dictionaryMetaSchema).max(1000),
})
export const dictionaryRegisterRequestSchema = z.object({ path: z.string().min(1).max(4096) })
export const dictionaryRegisterResponseSchema = z.object({ dictionary: dictionaryMetaSchema })
export const dictionaryRemoveRequestSchema = z.object({ id: z.string().min(8).max(64) })
export const dictionaryRemoveResponseSchema = z.object({ removed: z.boolean() })

const aiProviderConfigSchema = z.object({
  id: z.string().min(8).max(64),
  name: z.string().min(1).max(64),
  baseUrl: z.string().url().max(512),
  model: z.string().min(1).max(128),
  embeddingModel: z.string().min(1).max(128).optional(),
})

export const aiConfigListResponseSchema = z.object({
  providers: z.array(aiProviderConfigSchema).max(100),
})
export const aiConfigSaveRequestSchema = z.object({
  provider: aiProviderConfigSchema,
  apiKey: z.string().min(1).max(512),
})
export const aiConfigSaveResponseSchema = z.object({ provider: aiProviderConfigSchema })
export const aiConfigRemoveRequestSchema = z.object({ id: z.string().min(8).max(64) })
export const aiConfigRemoveResponseSchema = z.object({ removed: z.boolean() })

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
export const aiChatResponseSchema = z.object({ taskId: z.string().min(8).max(64) })
export const aiCancelRequestSchema = z.object({ taskId: z.string().min(8).max(64) })
export const aiCancelResponseSchema = z.object({ cancelled: z.boolean() })

export const aiEmbedRequestSchema = z.object({
  taskId: z.string().min(8).max(64),
  configId: z.string().min(8).max(64),
  texts: z.array(z.string().max(20_000)).min(1).max(500),
})
export const aiEmbedResponseSchema = z.object({
  vectors: z.array(z.array(z.number()).min(1).max(4096)).max(500),
})
const aiIndexChunkSchema = z.object({
  label: z.string().min(1).max(200),
  text: z.string().max(20_000),
  vector: z.array(z.number()).min(1).max(4096),
})
export const aiIndexPayloadSchema = z.object({
  chunks: z.array(aiIndexChunkSchema).max(5000),
  embeddingModel: z.string().min(1).max(128),
  createdAt: iso8601,
})
export const aiIndexGetRequestSchema = z.object({ bookHash })
export const aiIndexGetResponseSchema = z.object({ index: aiIndexPayloadSchema.nullable() })
export const aiIndexSetRequestSchema = z.object({ bookHash, index: aiIndexPayloadSchema })
export const aiIndexSetResponseSchema = z.object({ savedAt: iso8601 })

export const secretSetRequestSchema = z.object({
  key: z.string().min(4).max(128),
  value: z.string().max(4096),
})
export const secretGetRequestSchema = z.object({ key: z.string().min(4).max(128) })
export const secretGetResponseSchema = z.object({ value: z.string().nullable() })
export const secretDeleteRequestSchema = z.object({ key: z.string().min(4).max(128) })
export const secretDeleteResponseSchema = z.object({ deleted: z.boolean() })

/** Minimal structural interface any zod schema satisfies — keeps the map version-proof. */
export interface ResponseValidator<T> {
  parse(value: unknown): T
}

export const responseValidators: {
  [K in CommandName]: ResponseValidator<CommandMap[K]['response']>
} = {
  [COMMAND.systemPing]: systemPingResponseSchema,
  [COMMAND.appInfo]: appInfoSchema,
  [COMMAND.readerStateGet]: readerStateGetResponseSchema,
  [COMMAND.readerStateSet]: readerStateSetResponseSchema,
  [COMMAND.libraryList]: libraryListResponseSchema,
  [COMMAND.libraryImport]: libraryImportResponseSchema,
  [COMMAND.libraryRemove]: libraryRemoveResponseSchema,
  [COMMAND.dictionaryList]: dictionaryListResponseSchema,
  [COMMAND.dictionaryRegister]: dictionaryRegisterResponseSchema,
  [COMMAND.dictionaryRemove]: dictionaryRemoveResponseSchema,
  [COMMAND.aiConfigList]: aiConfigListResponseSchema,
  [COMMAND.aiConfigSave]: aiConfigSaveResponseSchema,
  [COMMAND.aiConfigRemove]: aiConfigRemoveResponseSchema,
  [COMMAND.aiChat]: aiChatResponseSchema,
  [COMMAND.aiCancel]: aiCancelResponseSchema,
  [COMMAND.aiEmbed]: aiEmbedResponseSchema,
  [COMMAND.aiIndexGet]: aiIndexGetResponseSchema,
  [COMMAND.aiIndexSet]: aiIndexSetResponseSchema,
  [COMMAND.secretSet]: secretDeleteResponseSchema,
  [COMMAND.secretGet]: secretGetResponseSchema,
  [COMMAND.secretDelete]: secretDeleteResponseSchema,
}

export const requestValidators: { [K in CommandName]: ResponseValidator<unknown> | undefined } = {
  [COMMAND.systemPing]: systemPingRequestSchema,
  [COMMAND.appInfo]: undefined,
  [COMMAND.readerStateGet]: readerStateGetRequestSchema,
  [COMMAND.readerStateSet]: readerStateSetRequestSchema,
  [COMMAND.libraryList]: undefined,
  [COMMAND.libraryImport]: libraryImportRequestSchema,
  [COMMAND.libraryRemove]: libraryRemoveRequestSchema,
  [COMMAND.dictionaryList]: undefined,
  [COMMAND.dictionaryRegister]: dictionaryRegisterRequestSchema,
  [COMMAND.dictionaryRemove]: dictionaryRemoveRequestSchema,
  [COMMAND.aiChat]: aiChatRequestSchema,
  [COMMAND.aiCancel]: aiCancelRequestSchema,
  [COMMAND.aiEmbed]: aiEmbedRequestSchema,
  [COMMAND.aiIndexGet]: aiIndexGetRequestSchema,
  [COMMAND.aiIndexSet]: aiIndexSetRequestSchema,
  [COMMAND.aiConfigSave]: aiConfigSaveRequestSchema,
  [COMMAND.aiConfigRemove]: aiConfigRemoveRequestSchema,
  [COMMAND.secretSet]: secretSetRequestSchema,
  [COMMAND.secretGet]: secretGetRequestSchema,
  [COMMAND.secretDelete]: secretDeleteRequestSchema,
  [COMMAND.aiConfigList]: undefined,
}
