import { useCallback, useEffect, useRef, useState } from 'react'
import { PaperPlaneRight, Sparkle, X } from '@phosphor-icons/react'
import { toAppError, type AiProviderConfig } from '@deepread/shared'
import {
  buildChatBody,
  chatEndpoint,
  createSseParser,
  extractDelta,
  type ChatMessage,
} from '@deepread/ai-core'
import { invokeCommand, invokeStreamingCommand, isTauriRuntime } from '../../lib/ipc'

interface AiDrawerProps {
  /** Current selection text (if any) is offered as quick context. */
  readonly selection: string | null
  /** Chapter/plain text snippet to give the assistant context. */
  readonly contextText: string | null
  readonly onClose: () => void
}

type ChatUiMessage = ChatMessage & { readonly streaming?: boolean }

type StreamPhase = 'idle' | 'streaming' | 'error'

const PROVIDER_PRESETS: readonly {
  readonly label: string
  readonly baseUrl: string
  readonly model: string
}[] = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: 'Ollama(本地)', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5:7b' },
]

export function AiDrawer({ selection, contextText, onClose }: AiDrawerProps) {
  const [providers, setProviders] = useState<readonly AiProviderConfig[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState({
    name: '',
    baseUrl: '',
    model: '',
    apiKey: '',
  })
  const [messages, setMessages] = useState<readonly ChatUiMessage[]>([])
  const [input, setInput] = useState('')
  const [phase, setPhase] = useState<StreamPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const taskIdRef = useRef<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    invokeCommand('ai.config.list', undefined)
      .then((response) => {
        if (cancelled) return
        setProviders(response.providers)
        setActiveId((current) => current ?? response.providers[0]?.id ?? null)
        if (response.providers.length === 0) setShowConfig(true)
      })
      .catch(() => {
        // Config list is optional on first paint; the config form retries.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const saveProvider = useCallback(async (): Promise<void> => {
    const id =
      activeId ?? `cfg-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
    try {
      const response = await invokeCommand('ai.config.save', {
        provider: {
          id,
          name: configForm.name.trim() || '自定义',
          baseUrl: configForm.baseUrl.trim(),
          model: configForm.model.trim(),
        },
        apiKey: configForm.apiKey.trim(),
      })
      setProviders((current) => [
        response.provider,
        ...current.filter((provider) => provider.id !== response.provider.id),
      ])
      setActiveId(response.provider.id)
      setShowConfig(false)
      setConfigForm({ name: '', baseUrl: '', model: '', apiKey: '' })
      setError(null)
    } catch (saveError) {
      setError(toAppError(saveError).message)
    }
  }, [activeId, configForm])

  const removeProvider = useCallback(async (id: string): Promise<void> => {
    try {
      await invokeCommand('ai.config.remove', { id })
      setProviders((current) => current.filter((provider) => provider.id !== id))
      setActiveId((current) => (current === id ? null : current))
    } catch (removeError) {
      setError(toAppError(removeError).message)
    }
  }, [])

  const send = useCallback(async (): Promise<void> => {
    const question = input.trim()
    // Browser mode goes through the mock path and needs no configId.
    const browserMode = !isTauriRuntime() && window.location.search.includes('mockKey')
    const configId = activeId
    if (!question || phase === 'streaming' || (!browserMode && !configId)) return

    const taskId = `task-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
    taskIdRef.current = taskId

    // System context: the book snippet/selection, clearly bounded (spec §34).
    const systemContext = [contextText, selection]
      .filter((text): text is string => text !== null && text.trim().length > 0)
      .map((text) => text.slice(0, 2000))
      .join('\n---\n')
    const outbound: ChatMessage[] = [
      ...(systemContext
        ? [{ role: 'system' as const, content: `以下是用户正在阅读的内容片段:\n${systemContext}` }]
        : []),
      ...messages
        .filter((message) => message.role !== 'system')
        .map(({ role, content }) => ({ role, content })),
      { role: 'user' as const, content: question },
    ]

    setMessages((current) => [
      ...current,
      { role: 'user', content: question },
      { role: 'assistant', content: '', streaming: true },
    ])
    setInput('')
    setPhase('streaming')
    setError(null)
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ block: 'end' }))

    const parser = createSseParser((data) => {
      const delta = extractDelta(data)
      if (delta.type === 'delta') {
        setMessages((current) => {
          const last = current[current.length - 1]
          if (!last || last.role !== 'assistant') return current
          return [
            ...current.slice(0, -1),
            { role: 'assistant', content: last.content + delta.text, streaming: true },
          ]
        })
      }
    })
    // Browser (non-Tauri) dev path: talk straight to a local mock server so
    // the full stream pipeline is exercisable without the Rust proxy. The key
    // comes from ?mockKey= and is never persisted.
    if (!isTauriRuntime()) {
      const params = new URLSearchParams(window.location.search)
      const mockKey = params.get('mockKey')
      const mockBase: string = '/mock-ai/v1'
      if (!mockKey) {
        setPhase('error')
        setError('浏览器模式请加 ?mockKey=sk-mock-test-key 以启用 mock 服务。')
        return
      }
      const response = await fetch(chatEndpoint(mockBase), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${mockKey}`,
        },
        body: buildChatBody({ model: 'mock-model', messages: outbound }),
      })
      if (!response.ok || !response.body) {
        setPhase('error')
        setError(`mock 服务错误(${response.status})`)
        return
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
      }
      parser.end()
      setPhase('idle')
      setMessages((current) => {
        const last = current[current.length - 1]
        if (!last || last.role !== 'assistant') return current
        return [...current.slice(0, -1), { role: 'assistant', content: last.content }]
      })
      return
    }

    try {
      await invokeStreamingCommand(
        'ai.chat',
        { taskId, configId: configId ?? '', messages: outbound },
        (event) => {
          if (event.type === 'done' || event.type === 'cancelled') {
            setPhase('idle')
            setMessages((current) => {
              const last = current[current.length - 1]
              if (!last || last.role !== 'assistant') return current
              return [...current.slice(0, -1), { role: 'assistant', content: last.content }]
            })
            taskIdRef.current = null
          } else if (event.type === 'error') {
            setPhase('error')
            setError(`${event.data.code}:${event.data.message}`)
            taskIdRef.current = null
          } else {
            parser.push(event.data)
          }
        },
      )
      // The channel keeps emitting after the invoke resolves; the parser is
      // closed by 'done'/error events above.
    } catch (chatError) {
      setPhase('error')
      setError(toAppError(chatError).message)
      taskIdRef.current = null
    }
  }, [activeId, contextText, input, messages, phase, selection])

  const cancel = useCallback(async (): Promise<void> => {
    const taskId = taskIdRef.current
    if (!taskId) return
    try {
      await invokeCommand('ai.cancel', { taskId })
    } catch {
      // Cancel is best-effort; the stream ends either way.
    }
  }, [])

  const applyPreset = (preset: (typeof PROVIDER_PRESETS)[number]): void => {
    setConfigForm((form) => ({
      ...form,
      name: preset.label,
      baseUrl: preset.baseUrl,
      model: preset.model,
    }))
  }

  return (
    <aside className="ai-drawer" aria-label="AI 助手">
      <div className="lookup-head">
        <strong>
          <Sparkle size={14} weight="fill" aria-hidden /> AI 助手
        </strong>
        <div className="ai-head-actions">
          <select
            className="ai-provider-select"
            value={activeId ?? ''}
            onChange={(event) => setActiveId(event.target.value || null)}
            aria-label="选择 AI 服务"
          >
            {providers.length === 0 && <option value="">未配置</option>}
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} · {provider.model}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="chrome-button"
            onClick={() => setShowConfig((open) => !open)}
            title={showConfig ? '收起配置' : '服务配置'}
          >
            <Sparkle size={14} weight="regular" aria-hidden />
          </button>
          <button type="button" className="chrome-button" onClick={onClose} title="关闭">
            <X size={14} weight="regular" aria-hidden />
          </button>
        </div>
      </div>

      {showConfig && (
        <section className="ai-config" aria-label="服务配置">
          {providers.map((provider) => (
            <div key={provider.id} className="settings-row dictionary-row">
              <span className="settings-label">
                {provider.name} · {provider.model}
              </span>
              <button
                type="button"
                className="chrome-button"
                onClick={() => void removeProvider(provider.id)}
                title="移除"
              >
                <X size={12} weight="regular" aria-hidden />
              </button>
            </div>
          ))}
          <div className="segmented ai-presets">
            {PROVIDER_PRESETS.map((preset) => (
              <button key={preset.label} type="button" onClick={() => applyPreset(preset)}>
                {preset.label}
              </button>
            ))}
          </div>
          <input
            className="ai-input"
            placeholder="名称"
            value={configForm.name}
            onChange={(event) => setConfigForm((form) => ({ ...form, name: event.target.value }))}
          />
          <input
            className="ai-input"
            placeholder="Base URL(OpenAI 兼容,含 /v1)"
            value={configForm.baseUrl}
            onChange={(event) =>
              setConfigForm((form) => ({ ...form, baseUrl: event.target.value }))
            }
          />
          <input
            className="ai-input"
            placeholder="模型名,如 deepseek-chat"
            value={configForm.model}
            onChange={(event) => setConfigForm((form) => ({ ...form, model: event.target.value }))}
          />
          <input
            className="ai-input"
            type="password"
            placeholder="API Key(存入系统钥匙串)"
            value={configForm.apiKey}
            onChange={(event) => setConfigForm((form) => ({ ...form, apiKey: event.target.value }))}
          />
          <button
            type="button"
            className="reader-error-button"
            onClick={() => void saveProvider()}
            disabled={
              configForm.baseUrl.trim().length === 0 || configForm.model.trim().length === 0
            }
          >
            保存配置
          </button>
          <p className="ai-privacy">
            密钥保存在本机钥匙串,不会进入页面或仓库;对话时仅发送下方勾选的正文片段。
          </p>
        </section>
      )}

      <div className="ai-messages">
        {messages.length === 0 && (
          <p className="lookup-empty">
            {selection
              ? `已带入选中文本(${selection.length} 字)。问点什么,比如“解释这段”。`
              : '向 AI 提问关于当前书籍的问题。可在目录抽屉选中文字后回来提问。'}
          </p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`ai-msg ai-msg-${message.role}`}>
            {message.content || (message.streaming ? '…' : '')}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error !== null && (
        <p className="ai-error" role="alert">
          {error}
        </p>
      )}

      <div className="ai-input-row">
        <input
          className="ai-input"
          placeholder="输入问题,回车发送"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
        />
        {phase === 'streaming' ? (
          <button
            type="button"
            className="chrome-button"
            onClick={() => void cancel()}
            title="停止"
          >
            <X size={16} weight="regular" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="chrome-button"
            onClick={() => void send()}
            disabled={
              (!activeId && !new URLSearchParams(window.location.search).has('mockKey')) ||
              input.trim().length === 0
            }
            title="发送"
          >
            <PaperPlaneRight size={16} weight="regular" aria-hidden />
          </button>
        )}
      </div>
    </aside>
  )
}
