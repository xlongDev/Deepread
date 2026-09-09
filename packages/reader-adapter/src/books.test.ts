import { describe, expect, it } from 'vitest'
import { buildTextBook, decodeText, escapeHtml, splitParagraphs } from './books/text-book'
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
