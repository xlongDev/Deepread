import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpenText, MagnifyingGlass, Plus, X } from '@phosphor-icons/react'
import { open } from '@tauri-apps/plugin-dialog'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { toAppError, type AppInfo, type LibraryBook } from '@deepread/shared'
import {
  ACCEPTED_EXTENSIONS,
  DIALOG_EXTENSIONS,
  classifyFile,
  openedBookFromFile,
  openedBookFromLibrary,
  type ImportProblem,
  type OpenedBook,
} from '../../lib/book-import'
import { invokeCommand, isTauriRuntime } from '../../lib/ipc'

const PROBLEM_MESSAGE: Readonly<Record<ImportProblem['kind'], string>> = {
  unsupported: '暂时不认识这个文件格式。目前支持 EPUB、MOBI、AZW3、FB2、CBZ、PDF、TXT、Markdown。',
  chm: 'CHM 暂不支持:阅读内核(foliate-js)还没有 CHM 解析器,我们如实告诉你,而不是假装能打开。',
}

/** Muted cover palettes; picked deterministically by book hash. */
const COVER_PALETTES: readonly (readonly [string, string])[] = [
  ['#dfe7f5', '#b9c8e8'], // indigo mist
  ['#dcf0ea', '#aedccf'], // sage
  ['#f7ecdb', '#eed7b3'], // sand
  ['#fbe7df', '#f2c9bc'], // clay
  ['#e9e4f4', '#cfc4e6'], // lavender gray
  ['#e2eef4', '#bcd8e6'], // dusk blue
]

function coverPalette(hash: string): readonly [string, string] {
  let value = 0
  for (const char of hash) value = (value * 31 + char.charCodeAt(0)) | 0
  return COVER_PALETTES[Math.abs(value) % COVER_PALETTES.length] ?? COVER_PALETTES[0]!
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

interface LibraryScreenProps {
  readonly onOpenBook: (book: OpenedBook) => void
  readonly backend: AppInfo | null
}

interface ShelfBook extends LibraryBook {
  readonly progress: number | null
}

export function LibraryScreen({ onOpenBook, backend }: LibraryScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [books, setBooks] = useState<readonly ShelfBook[]>([])
  const [libraryLoaded, setLibraryLoaded] = useState(!isTauriRuntime())
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  // Dev-only demo shelf (?demoShelf) so the grid is verifiable in a browser
  // without Tauri; production builds never see it (import.meta.env.DEV).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (!new URLSearchParams(window.location.search).has('demoShelf')) return
    if (!isTauriRuntime()) {
      setLibraryLoaded(true)
      setBooks([
        {
          hash: 'demo1',
          fileName: '化雪的季节.txt',
          format: 'txt',
          path: '',
          size: 382,
          addedAt: '',
          progress: 0.42,
        },
        {
          hash: 'demo2',
          fileName: '夜航书.epub',
          format: 'epub',
          path: '',
          size: 2391,
          addedAt: '',
          progress: 0.08,
        },
        {
          hash: 'demo3',
          fileName: '山中手记.fb2',
          format: 'fb2',
          path: '',
          size: 619,
          addedAt: '',
          progress: null,
        },
        {
          hash: 'demo4',
          fileName: '阅读笔记.md',
          format: 'md',
          path: '',
          size: 300,
          addedAt: '',
          progress: null,
        },
        {
          hash: 'demo5',
          fileName: '图解大模型生成式AI原理与实战.pdf',
          format: 'pdf',
          path: '',
          size: 11_000_000,
          addedAt: '',
          progress: 0.77,
        },
      ])
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- dev-only seed, runs once
  }, [])

  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    void (async () => {
      try {
        const response = await invokeCommand('library.list', undefined)
        // Attach real reading progress per book (reader.state stores it by hash).
        const withProgress = await Promise.all(
          response.books.map(async (book) => {
            try {
              const state = await invokeCommand('reader.state.get', { bookHash: book.hash })
              return { ...book, progress: state.state?.progress?.fraction ?? null }
            } catch {
              return { ...book, progress: null }
            }
          }),
        )
        if (!cancelled) setBooks(withProgress)
      } catch {
        // The library still works: importing will retry the list.
      } finally {
        if (!cancelled) setLibraryLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const importPaths = useCallback(async (paths: readonly string[]): Promise<void> => {
    for (const path of paths) {
      try {
        const response = await invokeCommand('library.import', { path })
        setBooks((current) => [
          { ...response.book, progress: null },
          ...current.filter((b) => b.hash !== response.book.hash),
        ])
        setProblem(null)
      } catch (error) {
        setProblem(toAppError(error).message ?? null)
      }
    }
  }, [])

  const importFromDialog = useCallback(async (): Promise<void> => {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: '电子书', extensions: DIALOG_EXTENSIONS }],
    })
    if (path) await importPaths([path])
  }, [importPaths])

  // In Tauri the webview intercepts file drops anywhere and reports absolute
  // paths — the browser file input below keeps working for dev mode only.
  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    let unlisten: (() => void) | undefined
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        const payload = event.payload
        if (payload.type === 'enter' || payload.type === 'over') setDragging(true)
        else if (payload.type === 'leave') setDragging(false)
        else if (payload.type === 'drop') {
          setDragging(false)
          void importPaths(payload.paths)
        }
      })
      .then((fn) => {
        if (cancelled) fn()
        else unlisten = fn
      })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [importPaths])

  const importFromBrowserFile = useCallback(
    async (files: readonly File[]): Promise<void> => {
      const file = files[0]
      if (!file) return
      const classified = classifyFile(file)
      if ('kind' in classified) {
        setProblem(PROBLEM_MESSAGE[classified.kind])
        return
      }
      setProblem(null)
      onOpenBook(await openedBookFromFile(file, classified.format))
    },
    [onOpenBook],
  )

  const removeFromLibrary = useCallback(async (hash: string): Promise<void> => {
    try {
      await invokeCommand('library.remove', { bookHash: hash })
      setBooks((current) => current.filter((b) => b.hash !== hash))
    } catch (error) {
      setProblem(toAppError(error).message ?? null)
    }
  }, [])

  const triggerImport = useCallback((): void => {
    if (isTauriRuntime()) void importFromDialog()
    else inputRef.current?.click()
  }, [importFromDialog])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return books
    return books.filter((book) => book.fileName.toLowerCase().includes(q))
  }, [books, query])

  const totalBytes = books.reduce((sum, book) => sum + book.size, 0)
  const reading = books.filter((book) => (book.progress ?? 0) > 0).length
  const openFileInput = (): void => inputRef.current?.click()

  return (
    <div
      className={`library${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        void importFromBrowserFile(Array.from(event.dataTransfer.files))
      }}
    >
      <header className="library-header">
        <span className="library-brand">Deepread</span>
        <span className="library-tagline">个人阅读操作系统</span>
      </header>

      <main className="library-main">
        {libraryLoaded && books.length === 0 && (
          <section className="library-empty" aria-label="导入书籍">
            <button
              type="button"
              className="library-drop-button"
              onClick={openFileInput}
              aria-label="导入书籍"
            >
              <BookOpenText size={44} weight="light" aria-hidden />
              <span className="library-empty-title">导入一本书</span>
              <span className="library-empty-hint">
                EPUB、MOBI、AZW3、FB2、CBZ、PDF、TXT、Markdown
              </span>
            </button>
            <p className="library-note">
              浏览器模式:导入的书籍只在当前会话有效;下载桌面版获得书架与进度记忆。
            </p>
          </section>
        )}

        {isTauriRuntime() && !libraryLoaded && (
          <div className="shelf-skeleton" aria-label="书架加载中">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="shelf-skeleton-card"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        )}

        {isTauriRuntime() && libraryLoaded && books.length === 0 && (
          <section className="library-empty" aria-label="导入书籍">
            <button
              type="button"
              className="library-drop-button"
              onClick={triggerImport}
              aria-label="导入书籍"
            >
              <BookOpenText size={44} weight="light" aria-hidden />
              <span className="library-empty-title">把书拖进窗口,或点击导入</span>
              <span className="library-empty-hint">
                EPUB、MOBI、AZW3、FB2、CBZ、PDF、TXT、Markdown
              </span>
            </button>
          </section>
        )}

        {libraryLoaded && books.length > 0 && (
          <>
            <div className="shelf-toolbar">
              <h1 className="shelf-title">
                书架 <span className="shelf-count">{books.length}</span>
              </h1>
              <div className="shelf-search">
                <MagnifyingGlass size={15} weight="regular" aria-hidden />
                <input
                  type="search"
                  placeholder="搜索书名…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setQuery('')
                  }}
                  aria-label="搜索书名"
                />
              </div>
              <button
                type="button"
                className="shelf-import"
                onClick={triggerImport}
                aria-label="导入书籍"
              >
                <Plus size={15} weight="bold" aria-hidden /> 导入
              </button>
            </div>

            {filtered.length === 0 ? (
              <p className="shelf-none">没有匹配“{query}”的书。</p>
            ) : (
              <ul className="shelf-grid" aria-label="书架">
                {filtered.map((book, index) => {
                  const palette = coverPalette(book.hash)
                  const title = book.fileName.replace(/\.[^.]+$/, '')
                  const progress = book.progress
                  return (
                    <li
                      key={book.hash}
                      className="book-card"
                      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
                    >
                      <button
                        type="button"
                        className="book-cover"
                        style={{
                          background: `linear-gradient(160deg, ${palette[0]}, ${palette[1]})`,
                        }}
                        onClick={() => onOpenBook(openedBookFromLibrary(book))}
                        title={`打开《${title}》`}
                      >
                        <span className="book-cover-char">{title.charAt(0)}</span>
                        <span className="book-cover-title">{title}</span>
                        <span className="book-format">{book.format.toUpperCase()}</span>
                        {progress !== null && progress > 0 && (
                          <span className="book-progress" aria-hidden>
                            <span
                              className="book-progress-fill"
                              style={{ width: `${progress * 100}%` }}
                            />
                          </span>
                        )}
                      </button>
                      <div className="book-meta">
                        <span className="book-meta-title" title={book.fileName}>
                          {title}
                        </span>
                        <span className="book-meta-sub">
                          {progress !== null && progress > 0
                            ? `读到 ${Math.round(progress * 100)}% · ${formatBytes(book.size)}`
                            : formatBytes(book.size)}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="book-remove"
                        onClick={() => void removeFromLibrary(book.hash)}
                        title="从书架移除(不删除原文件)"
                      >
                        <X size={13} weight="regular" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}

        {problem !== null && (
          <p className="library-error" role="alert">
            {problem}
          </p>
        )}
      </main>

      <footer className="library-footer">
        {isTauriRuntime() && books.length > 0 && (
          <span>
            {books.length} 本{reading > 0 ? ` · 在读 ${reading}` : ''} · 共{' '}
            {formatBytes(totalBytes)}
            {' · '}
          </span>
        )}
        {backend !== null ? (
          <span>
            {backend.appName} {backend.appVersion} · {backend.os}/{backend.arch}
          </span>
        ) : (
          <span>本地模式</span>
        )}
      </footer>

      {dragging && (
        <div className="drop-overlay" aria-hidden>
          <div className="drop-overlay-card">松开导入到书架</div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        className="visually-hidden"
        onChange={(event) => {
          void importFromBrowserFile(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />
    </div>
  )
}
