import { describe, expect, it } from 'vitest'
import type { CharactersPayload } from './characters'
import { buildCharacterGraph, graphSvgString, layoutCircle } from './graph'

const payload: CharactersPayload = {
  characters: [
    {
      name: '守灯人',
      aliases: [],
      role: '主角',
      description: '点灯的人',
      relationships: [
        { with: '孩子们', type: '同伴' },
        { with: '无名氏', type: '未知' },
      ],
    },
    {
      name: '孩子们',
      aliases: [],
      role: '路人',
      description: '数滴水',
      relationships: [{ with: '守灯人', type: '同伴' }],
    },
  ],
}

describe('buildCharacterGraph', () => {
  it('deduplicates mutual relations and reports dangling targets', () => {
    const graph = buildCharacterGraph(payload)
    expect(graph.nodes.map((n) => n.name)).toEqual(['守灯人', '孩子们'])
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]).toMatchObject({ from: '守灯人', to: '孩子们', label: '同伴' })
    expect(graph.dangling).toEqual([{ from: '守灯人', to: '无名氏' }])
  })
})

describe('layoutCircle', () => {
  it('places nodes evenly with stable ordering', () => {
    const graph = buildCharacterGraph(payload)
    const layout = layoutCircle(graph, 1000)
    expect(layout.positions).toHaveLength(2)
    // zh-order: 孩子们 before 守灯人; first at top center, second at bottom
    expect(layout.positions[0]).toMatchObject({ name: '孩子们', x: 500, y: 120 })
    expect(layout.positions[1]).toMatchObject({ name: '守灯人', x: 500, y: 880 })
  })
})

describe('graphSvgString', () => {
  it('produces a self-contained svg with nodes, edges and labels', () => {
    const graph = buildCharacterGraph(payload)
    const svg = graphSvgString(graph, layoutCircle(graph), {
      background: '#ffffff',
      foreground: '#111111',
      accent: '#3d6deb',
    })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('<line')
    expect(svg).toContain('同伴')
    expect(svg).toContain('守灯人')
    expect(svg).toContain('点灯的人') // <title> tooltip
    expect(svg).not.toContain('&amp;&amp;')
  })

  it('escapes xml-sensitive characters in labels', () => {
    const graph = buildCharacterGraph({
      characters: [
        {
          name: 'A<B>',
          aliases: [],
          role: '主角',
          description: 'desc & "quote"',
          relationships: [],
        },
      ],
    })
    const svg = graphSvgString(graph, layoutCircle(graph), {
      background: '#fff',
      foreground: '#000',
      accent: '#000',
    })
    expect(svg).toContain('A&lt;B&gt;')
    expect(svg).toContain('desc &amp; &quot;quote&quot;')
  })
})
