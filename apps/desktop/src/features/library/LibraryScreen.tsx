import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { BookOpenText, X } from '@phosphor-icons/react'
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

interface LibraryScreenProps {
  readonly onOpenBook: (book: OpenedBook) => void
  readonly backend: AppInfo | null
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function LibraryScreen({ onOpenBook, backend }: LibraryScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [books, setBooks] = useState<readonly LibraryBook[]>([])
  const [libraryLoaded, setLibraryLoaded] = useState(!isTauriRuntime())
  const [dragging, setDragging] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!isTauriRuntime()) return
    let cancelled = false
    invokeCommand('library.list', undefined)
      .then((response) => {
        if (!cancelled) setBooks(response.books)
      })
      .catch(() => {
        // The library still works: importing will retry the list.
      })
      .finally(() => {
        if (!cancelled) setLibraryLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const importPaths = useCallback(async (paths: readonly string[]): Promise<void> => {
    for (const path of paths) {
      try {
        const response = await invokeCommand('library.import', { path })
        setBooks((current) => [
          response.book,
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

  // In Tauri the webview intercepts file drops and reports absolute paths,
  // which go straight to library.import — the browser path below keeps
  // working for dev mode only.
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

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    void importFromBrowserFile(Array.from(event.dataTransfer.files))
  }

  return (
    <main className="library">
      <div
        className={`library-drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className="library-drop-button"
          onClick={() => {
            if (isTauriRuntime()) void importFromDialog()
            else inputRef.current?.click()
          }}
          aria-label="导入书籍"
        >
          <BookOpenText size={44} weight="light" aria-hidden />
          <span className="library-title">导入一本书</span>
          <span className="library-hint">EPUB、MOBI、AZW3、FB2、CBZ、PDF、TXT、Markdown</span>
        </button>
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

      {problem !== null && (
        <p className="library-error" role="alert">
          {problem}
        </p>
      )}

      {isTauriRuntime() && libraryLoaded && books.length > 0 && (
        <ul className="library-list" aria-label="书架">
          {books.map((book) => (
            <li key={book.hash} className="library-item">
              <button
                type="button"
                className="library-item-open"
                onClick={() => onOpenBook(openedBookFromLibrary(book))}
              >
                <span className="library-item-title">{book.fileName}</span>
                <span className="library-item-meta">
                  {book.format.toUpperCase()} · {formatBytes(book.size)}
                </span>
              </button>
              <button
                type="button"
                className="chrome-button library-item-remove"
                onClick={() => void removeFromLibrary(book.hash)}
                title="从书架移除(不删除原文件)"
              >
                <X size={14} weight="regular" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isTauriRuntime() && (
        <p className="library-note">
          浏览器模式:导入的书籍只在当前会话有效;下载桌面版获得书架与进度同步。
        </p>
      )}

      <footer className="library-footer">
        {backend !== null ? (
          <span>
            {backend.appName} {backend.appVersion} · {backend.os}/{backend.arch}
          </span>
        ) : (
          <span>本地模式</span>
        )}
      </footer>
    </main>
  )
}
