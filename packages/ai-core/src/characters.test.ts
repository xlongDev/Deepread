import { describe, expect, it } from 'vitest'
import { buildCharactersMessages, parseCharacters } from './characters'

const chapters = [
  { label: '第一章 灯', text: '守灯人把灯点上。' },
  { label: '第二章 信', text: '老人说,信就到了。' },
]

describe('buildCharactersMessages', () => {
  it('bounds excerpts and demands evidence-based extraction', () => {
    const messages = buildCharactersMessages(chapters, '化雪的季节')
    expect(messages[0]?.content).toContain('《化雪的季节》')
    expect(messages[0]?.content).toContain('不要编造')
    expect(messages[1]?.content).toContain('守灯人')
  })
})

describe('parseCharacters', () => {
  it('accepts valid character cards', () => {
    const payload = parseCharacters(
      '{"characters":[{"name":"守灯人","aliases":[],"role":"主角","description":"点灯的人"}]}',
    )
    expect(payload.characters[0]?.name).toBe('守灯人')
  })

  it('rejects unknown roles', () => {
    expect(() =>
      parseCharacters('{"characters":[{"name":"x","aliases":[],"role":"导演","description":"y"}]}'),
    ).toThrow()
  })

  it('rejects output without JSON', () => {
    expect(() => parseCharacters('没有')).toThrow('JSON 对象')
  })
})
