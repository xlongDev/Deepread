/**
 * Character relationship graph (spec §40, MVP scope): builds a graph from the
 * characters artifact and renders it as a self-contained circular-layout SVG.
 * Pure functions here are unit-tested; the React component only wires
 * zoom/pan/export around the generated string. No graph library (ADR-0001).
 */

import type { CharactersPayload } from './characters'

export interface GraphNode {
  readonly name: string
  readonly role: string
  readonly description: string
}

export interface GraphEdge {
  readonly from: string
  readonly to: string
  readonly label: string
}

export interface CharacterGraph {
  readonly nodes: readonly GraphNode[]
  readonly edges: readonly GraphEdge[]
  /** Relations dropped because the target character was not extracted. */
  readonly dangling: readonly { readonly from: string; readonly to: string }[]
}

export function buildCharacterGraph(payload: CharactersPayload): CharacterGraph {
  const nodes: GraphNode[] = payload.characters.map((character) => ({
    name: character.name,
    role: character.role,
    description: character.description,
  }))
  const names = new Set(nodes.map((node) => node.name))
  const edges: GraphEdge[] = []
  const dangling: { from: string; to: string }[] = []
  const seen = new Set<string>()
  for (const character of payload.characters) {
    for (const relation of character.relationships) {
      if (!names.has(relation.with)) {
        dangling.push({ from: character.name, to: relation.with })
        continue
      }
      // Deduplicate mutual pairs (A→B and B→A draw one line).
      const key = [character.name, relation.with].sort().join('|') + relation.type
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ from: character.name, to: relation.with, label: relation.type })
    }
  }
  return { nodes, edges, dangling }
}

export interface GraphLayout {
  /** Nodes with computed center coordinates in the SVG coordinate space. */
  readonly positions: readonly {
    readonly name: string
    readonly x: number
    readonly y: number
  }[]
  readonly size: number
}

/** Even circular layout, ordered by name for stability across renders. */
export function layoutCircle(graph: CharacterGraph, size = 1000): GraphLayout {
  const radius = size * 0.38
  const center = size / 2
  const sorted = [...graph.nodes].sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  const positions = sorted.map((node, index) => {
    const angle = (2 * Math.PI * index) / Math.max(1, sorted.length) - Math.PI / 2
    return {
      name: node.name,
      x: Math.round(center + radius * Math.cos(angle)),
      y: Math.round(center + radius * Math.sin(angle)),
    }
  })
  return { positions, size }
}

export interface GraphSvgOptions {
  readonly background: string
  readonly foreground: string
  readonly accent: string
}

const escapeXml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/** Render the graph as a self-contained SVG string (used for view + export). */
export function graphSvgString(
  graph: CharacterGraph,
  layout: GraphLayout,
  options: GraphSvgOptions,
): string {
  const positionOf = new Map(layout.positions.map((p) => [p.name, p]))
  const size = layout.size
  const lines: string[] = []
  for (const edge of graph.edges) {
    const from = positionOf.get(edge.from)
    const to = positionOf.get(edge.to)
    if (!from || !to) continue
    lines.push(
      `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${escapeXml(options.accent)}" stroke-width="2" stroke-opacity="0.6"/>`,
    )
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    lines.push(
      `<text x="${midX}" y="${midY - 6}" font-size="20" fill="${escapeXml(options.foreground)}" text-anchor="middle" opacity="0.75">${escapeXml(edge.label)}</text>`,
    )
  }
  const circles: string[] = []
  for (const node of graph.nodes) {
    const position = positionOf.get(node.name)
    if (!position) continue
    circles.push(
      `<g><circle cx="${position.x}" cy="${position.y}" r="46" fill="${escapeXml(options.background)}" stroke="${escapeXml(options.accent)}" stroke-width="3"/><text x="${position.x}" y="${position.y + 7}" font-size="24" fill="${escapeXml(options.foreground)}" text-anchor="middle">${escapeXml(node.name)}</text><title>${escapeXml(node.description)}</title></g>`,
    )
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" font-family="sans-serif">`,
    `<rect width="${size}" height="${size}" fill="${escapeXml(options.background)}"/>`,
    ...lines,
    ...circles,
    '</svg>',
  ].join('\n')
}
