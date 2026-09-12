import { describe, expect, it } from 'vitest'
import {
  buildOutlineMessages,
  buildSummaryMessages,
  extractJsonObject,
  parseOutlineInsight,
  parseSummaryInsight,
} from './insights'

const chapters = [
  { label: '第一章 灯', text: '化雪的时候,镇上的人把屋檐下的灯全都点了起来。雪水滴落。' },
  { label: '第二章 信', text: '老人说,雪化完的那天,信就到了。' },
]

describe('buildSummaryMessages', () => {
  it('includes chapter excerpts, title and the JSON structure rule', () => {
    const messages = buildSummaryMessages(chapters, '化雪的季节')
    expect(messages[0]?.content).toContain('《化雪的季节》')
    expect(messages[0]?.content).toContain('"overview"')
    expect(messages[0]?.content).toContain('并非全书内容')
    expect(messages[1]?.content).toContain('【第一章 灯】')
    expect(messages[1]?.content).toContain('雪水滴落')
  })

  it('caps chapters at the configured maximum', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `第${i}章`, text: 'x' }))
    const messages = buildSummaryMessages(many, '书')
    expect(messages[1]?.content.match(/【第/g)?.length).toBe(12)
  })
})

describe('buildOutlineMessages', () => {
  it('asks for per-chapter coverage in order', () => {
    const messages = buildOutlineMessages(chapters, '化雪的季节')
    expect(messages[0]?.content).toContain('覆盖给出的每一章,顺序一致')
    expect(messages[1]?.content).toContain('【第二章 信】')
  })
})

describe('extractJsonObject', () => {
  it('parses bare JSON', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses fenced JSON and ignores surrounding prose', () => {
    expect(extractJsonObject('好的:\n```json\n{"a":2}\n```\n以上。')).toEqual({ a: 2 })
  })

  it('throws when no object exists', () => {
    expect(() => extractJsonObject('没有 JSON')).toThrow('JSON 对象')
  })
})

describe('parseSummaryInsight', () => {
  it('accepts a valid summary', () => {
    const insight = parseSummaryInsight(
      '```json\n{"overview":"雪季的故事","themes":["等待","灯"],"coverage":"基于章节开头"}\n```',
    )
    expect(insight.overview).toBe('雪季的故事')
    expect(insight.themes).toEqual(['等待', '灯'])
  })

  it('rejects missing coverage', () => {
    expect(() => parseSummaryInsight('{"overview":"x","themes":[]}')).toThrow()
  })
})

describe('parseOutlineInsight', () => {
  it('accepts a valid outline', () => {
    const insight = parseOutlineInsight('{"chapters":[{"title":"第一章 灯","gist":"点灯迎信"}]}')
    expect(insight.chapters[0]?.title).toBe('第一章 灯')
  })

  it('rejects empty chapters', () => {
    expect(() => parseOutlineInsight('{"chapters":[]}')).toThrow()
  })
})
