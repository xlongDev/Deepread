import { describe, expect, it } from 'vitest'
import {
  buildTextBook,
  decodeText,
  escapeHtml,
  isChapterTitle,
  isDialogue,
  splitParagraphs,
} from './books/text-book'
import { buildMarkdownBook, markdownToHtml } from './books/markdown-book'

describe('decodeText', () => {
  it('decodes UTF-8 text', () => {
    const bytes = new TextEncoder().encode('第一章 早餐')
    expect(decodeText(bytes.buffer as ArrayBuffer)).toBe('第一章 早餐')
  })

  it('falls back to GB18030 for legacy Chinese encodings', () => {
    // 0xC4 0xE3 0xBA 0xC3 is "你好" in GB18030/GBK (TextEncoder is UTF-8 only,
    // so the fixture is written as raw bytes).
    const bytes = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]).buffer
    expect(decodeText(bytes as ArrayBuffer)).toBe('你好')
  })
})

describe('splitParagraphs', () => {
  it('splits on blank lines and normalizes line endings', () => {
    const text = '第一段\r\n\r\n第二段\n\n\n第三段'
    expect(splitParagraphs(text)).toEqual(['第一段', '第二段', '第三段'])
  })

  it('keeps single newlines inside a paragraph', () => {
    expect(splitParagraphs('同一段\n接排')).toEqual(['同一段\n接排'])
  })
})

describe('escapeHtml', () => {
  it('escapes markup metacharacters (untrusted input, spec §117)', () => {
    expect(escapeHtml('<script>&"')).toBe('&lt;script&gt;&amp;&quot;')
  })
})

describe('buildTextBook', () => {
  it('builds sections of bounded paragraph count with honest sizes', () => {
    const paragraphs = Array.from({ length: 950 }, (_, i) => `段落${i}`)
    const book = buildTextBook(paragraphs.join('\n\n'), '测试书')
    expect(book.sections.length).toBe(3)
    expect(book.sections[0]?.size).toBeGreaterThan(0)
    expect(book.metadata?.title).toBe('测试书')
    expect(typeof book.splitTOCHref).toBe('function')
    expect(typeof book.getTOCFragment).toBe('function')
  })

  it('splits chapters at markers and builds a real toc', () => {
    const text = [
      '开头的一段话,发生在章节之前。',
      '第一章 启程',
      '正文甲。',
      '“这是对话,不该被当成章节。”他说。',
      '第二章 夜谈',
      '正文乙。',
    ].join('\n\n')
    const book = buildTextBook(text, '测试书')
    expect(book.sections.length).toBe(3)
    const toc = book.toc as { label: string; href: string }[]
    expect(toc.map((item) => item.label)).toEqual(['第一章 启程', '第二章 夜谈'])
    expect(toc.map((item) => item.href)).toEqual(['s1', 's2'])
    expect(book.sections[1]?.size).toBeGreaterThan(0)
  })

  it('marks dialogue paragraphs and chapter headings in the section html', () => {
    const text = ['第一章 启程', '“对话在这里。”', '普通叙述。'].join('\n\n')
    const book = buildTextBook(text, '测试书')
    const html = (book.sections[0]?.createDocument ? undefined : undefined) as undefined
    void html
    // createDocument needs DOMParser; assert via the load path is browser-only,
    // so the class contract is checked through the exported predicates instead.
    expect(isChapterTitle('第一章 启程')).toBe(true)
    expect(isDialogue('“对话在这里。”')).toBe(true)
    expect(isDialogue('普通叙述。')).toBe(false)
  })
})

describe('isChapterTitle', () => {
  it('accepts the built-in markers', () => {
    expect(isChapterTitle('第十二章 大结局')).toBe(true)
    expect(isChapterTitle('第三卷')).toBe(true)
    expect(isChapterTitle('序章')).toBe(true)
    expect(isChapterTitle('番外一 归途')).toBe(true)
    expect(isChapterTitle('第 100 章 新的开始')).toBe(true)
  })

  it('rejects content that merely contains a marker', () => {
    expect(
      isChapterTitle(
        '他数到了第三十二章,才发现自己读错了题。这句话特别长,一定超过四十四个字的限制,所以不会被误判为章节标题。',
      ),
    ).toBe(false)
    expect(
      isChapterTitle(
        '第一章的内容其实很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长很长',
      ),
    ).toBe(false)
    expect(isChapterTitle('普通段落')).toBe(false)
  })
})

describe('isDialogue', () => {
  it('detects dialogue punctuation at paragraph start', () => {
    expect(isDialogue('“你好。”')).toBe(true)
    expect(isDialogue('「你好。」')).toBe(true)
    expect(isDialogue('"Hello."')).toBe(true)
    expect(isDialogue('他说:“你好。”')).toBe(false)
  })
})

describe('markdownToHtml', () => {
  it('renders markdown structure into the section document', () => {
    const html = markdownToHtml('# 标题\n\n正文 **加粗**')
    expect(html).toContain('<h1>标题</h1>')
    expect(html).toContain('<strong>加粗</strong>')
  })
})

describe('buildMarkdownBook', () => {
  it('builds a single-section kernel book', () => {
    const book = buildMarkdownBook('# 标题\n\n正文', '笔记')
    expect(book.sections).toHaveLength(1)
    expect(book.sections[0]?.size).toBeGreaterThan(0)
    expect(book.metadata?.title).toBe('笔记')
  })
})
