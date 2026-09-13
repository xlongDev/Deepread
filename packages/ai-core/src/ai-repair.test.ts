import { describe, expect, it } from 'vitest'
import { applyCorrections, buildRepairMessages, parseCorrections } from './ai-repair'

const SOURCE = '化雪的时候,真上的人把灯点了起来。灯芯偶尔响一声。'

describe('buildRepairMessages', () => {
  it('bounds the excerpt and demands verbatim-unique find strings', () => {
    const messages = buildRepairMessages(SOURCE, '化雪的季节')
    expect(messages[0]?.content).toContain('《化雪的季节》')
    expect(messages[0]?.content).toContain('逐字出现')
    expect(messages[1]?.content).toContain('真上的人')
  })
})

describe('parseCorrections', () => {
  it('anchors valid corrections with occurrence counts', () => {
    const corrections = parseCorrections(
      '{"corrections":[{"find":"真上","replace":"镇上","reason":"错别字"},{"find":"灯芯","replace":"灯芯","reason":"无变化"}]}',
      SOURCE,
    )
    expect(corrections).toHaveLength(1)
    expect(corrections[0]).toMatchObject({
      find: '真上',
      replace: '镇上',
      occurrences: 1,
    })
  })

  it('drops corrections whose find is absent', () => {
    const corrections = parseCorrections(
      '{"corrections":[{"find":"不存在的句子","replace":"x","reason":"y"}]}',
      SOURCE,
    )
    expect(corrections).toHaveLength(0)
  })

  it('keeps multi-occurrence finds but marks the count', () => {
    const corrections = parseCorrections(
      '{"corrections":[{"find":"灯","replace":"燈","reason":"繁体"}]}',
      SOURCE,
    )
    expect(corrections[0]?.occurrences).toBe(2)
  })

  it('returns empty for unparseable output', () => {
    expect(parseCorrections('没有 JSON', SOURCE)).toHaveLength(0)
    expect(
      parseCorrections('{"corrections":[{"find":"","replace":"","reason":""}]}', SOURCE),
    ).toHaveLength(0)
  })
})

describe('applyCorrections', () => {
  it('applies only accepted unique matches', () => {
    const corrections = parseCorrections(
      '{"corrections":[{"find":"真上","replace":"镇上","reason":"错别字"}]}',
      SOURCE,
    )
    const result = applyCorrections(SOURCE, corrections, [corrections[0]!.id])
    expect(result).toEqual({ text: SOURCE.replace('真上', '镇上'), applied: 1, skipped: 0 })
  })

  it('skips accepted corrections whose match is no longer unique', () => {
    const corrections = parseCorrections(
      '{"corrections":[{"find":"灯","replace":"燈","reason":"繁体"}]}',
      SOURCE,
    )
    const result = applyCorrections(SOURCE, corrections, [corrections[0]!.id])
    expect(result.applied).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.text).toBe(SOURCE)
  })

  it('is a no-op when nothing is accepted', () => {
    const corrections = parseCorrections(
      '{"corrections":[{"find":"真上","replace":"镇上","reason":"错别字"}]}',
      SOURCE,
    )
    expect(applyCorrections(SOURCE, corrections, []).text).toBe(SOURCE)
  })
})
