import { useCallback, useMemo, useRef, useState } from 'react'
import { ArrowCounterClockwise, Download, X } from '@phosphor-icons/react'
import {
  buildCharacterGraph,
  graphSvgString,
  layoutCircle,
  type CharactersPayload,
} from '@deepread/ai-core'

interface GraphViewProps {
  readonly payload: CharactersPayload
  readonly onClose: () => void
}

const BASE_VIEWBOX = { x: 0, y: 0, w: 1000, h: 1000 }

export function GraphView({ payload, onClose }: GraphViewProps) {
  const [viewBox, setViewBox] = useState(BASE_VIEWBOX)
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)

  const graph = useMemo(() => buildCharacterGraph(payload), [payload])
  const layout = useMemo(() => layoutCircle(graph), [graph])
  const svg = useMemo(
    () =>
      graphSvgString(graph, layout, {
        background: '#ffffff',
        foreground: '#1d1b17',
        accent: '#3d6deb',
      }),
    [graph, layout],
  )

  // Wheel zoom around the cursor: shrink/grow the viewBox, clamped so the
  // graph never disappears or gets absurdly cropped.
  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    setViewBox((current) => {
      const factor = event.deltaY > 0 ? 1.2 : 1 / 1.2
      const width = Math.min(4000, Math.max(160, current.w * factor))
      const height = width
      const ratioX = (event.clientX - 40) / (window.innerWidth - 80)
      const ratioY = (event.clientY - 40) / (window.innerHeight - 80)
      const x = current.x + (current.w - width) * ratioX
      const y = current.y + (current.h - height) * ratioY
      return { x, y, w: width, h: height }
    })
  }, [])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      dragRef.current = { x: event.clientX, y: event.clientY, vx: viewBox.x, vy: viewBox.y }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [viewBox],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current
      if (!drag) return
      const svgElement = event.currentTarget
      const scale = viewBox.w / Math.max(1, svgElement.clientWidth)
      setViewBox((current) => ({
        ...current,
        x: drag.vx - (event.clientX - drag.x) * scale,
        y: drag.vy - (event.clientY - drag.y) * scale,
      }))
    },
    [viewBox.w],
  )

  const onPointerUp = useCallback(() => {
    dragRef.current = null
  }, [])

  const reset = useCallback(() => setViewBox(BASE_VIEWBOX), [])

  const exportSvg = useCallback(() => {
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'characters-graph.svg'
    anchor.click()
    URL.revokeObjectURL(url)
  }, [svg])

  return (
    <section className="graph-overlay" aria-label="角色关系图">
      <header className="graph-head">
        <strong>角色关系图</strong>
        <span className="graph-hint">滚轮缩放 · 拖拽平移</span>
        <div className="ai-head-actions">
          <button type="button" className="chrome-button" onClick={reset} title="重置视图">
            <ArrowCounterClockwise size={16} weight="regular" aria-hidden />
          </button>
          <button type="button" className="chrome-button" onClick={exportSvg} title="导出 SVG">
            <Download size={16} weight="regular" aria-hidden />
          </button>
          <button type="button" className="chrome-button" onClick={onClose} title="关闭">
            <X size={16} weight="regular" aria-hidden />
          </button>
        </div>
      </header>
      {graph.nodes.length === 0 ? (
        <p className="lookup-empty">还没有可绘图的角色,先抽取角色。</p>
      ) : (
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="graph-svg"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          aria-roledescription="图示"
          aria-label={`角色关系图:${graph.nodes.map((n) => n.name).join('、')}`}
        >
          <g dangerouslySetInnerHTML={{ __html: svg.replace(/^<svg[^>]*>|<\/svg>$/g, '') }} />
        </svg>
      )}
      {graph.dangling.length > 0 && (
        <p className="graph-dangling">{graph.dangling.length} 条关系指向未抽取到的角色,未绘制。</p>
      )}
    </section>
  )
}
