import { useEffect, useMemo, useRef, useState } from 'react'
import { Background, MarkerType, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { GraphEdgeModel, GraphNodeModel } from '@/types'
import { easeMove, growOrigin, type Point } from '@/features/runtime/grow'
import { layoutGraph, nodeSize } from '@/features/runtime/layoutGraph'
import { usePrefersReducedMotion } from '@/hooks/useProject'
import { RuntimeEdge } from '@/features/runtime/RuntimeEdge'
import { RuntimeNode } from '@/features/runtime/RuntimeNode'
import { RuntimeGraphToolbar, type GraphFilter } from '@/features/runtime/RuntimeGraphToolbar'
import type { GraphMode } from '@/types'
import type { RuntimeFlowEdge, RuntimeNodeData } from '@/features/runtime/flowTypes'

const nodeTypes = { runtime: RuntimeNode }
const edgeTypes = { runtime: RuntimeEdge }

const EDGE_COLOR: Record<string, string> = {
  trigger: '#6366f1',
  delegate: '#334155',
  spawn: '#7c3aed',
  message: '#64748b',
  tool_call: '#059669',
  api_call: '#0284c7',
  mcp_call: '#d97706',
  data: '#94a3b8',
  review: '#f59e0b',
  result: '#10b981',
}

const GROW_MS = 240

function startGrow(from: Map<string, Point>, to: Map<string, Point>, onFrame: (frame: Map<string, Point>) => void) {
  const start = performance.now()
  let raf = 0
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / GROW_MS)
    const e = easeMove(t)
    const frame = new Map<string, Point>()
    for (const [id, end] of to) {
      const a = from.get(id) ?? end
      frame.set(id, { x: a.x + (end.x - a.x) * e, y: a.y + (end.y - a.y) * e })
    }
    onFrame(frame)
    if (t < 1) raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}

function dimmed(node: GraphNodeModel, filter: GraphFilter) {
  if (filter === 'all') return false
  if (filter === 'agents') return !['trigger', 'coordinator', 'agent', 'sub_agent'].includes(node.kind)
  if (filter === 'calls') return !['tool', 'api', 'mcp', 'data_source'].includes(node.kind)
  return node.kind !== 'human_review'
}

function CanvasBody({
  nodes,
  edges,
  selectedId,
  onSelect,
  mode,
  onMode,
  onReplay,
  replaying,
  onLive,
  speed,
  onSpeed,
  liveMessage,
}: {
  nodes: GraphNodeModel[]
  edges: GraphEdgeModel[]
  selectedId?: string
  onSelect: (id: string) => void
  mode: GraphMode
  onMode: (mode: GraphMode) => void
  onReplay: () => void
  replaying: boolean
  onLive: () => void
  speed: number
  onSpeed: (speed: number) => void
  liveMessage: string
}) {
  const reduced = usePrefersReducedMotion()
  const { zoomIn, zoomOut, setViewport, getViewport } = useReactFlow()
  const pane = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<GraphFilter>('all')
  const [pos, setPos] = useState<Map<string, Point>>(new Map())
  const [born, setBorn] = useState<Set<string>>(new Set())
  const graphRef = useRef({ nodes, edges })
  graphRef.current = { nodes, edges }
  const posRef = useRef(pos)
  posRef.current = pos
  const stopGrow = useRef(() => {})
  const sig = `${nodes.map((n) => n.id).join('|')}::${edges.map((e) => e.id).join('|')}`

  const frameGraph = () => {
    const el = pane.current
    const placed = posRef.current
    if (!el || placed.size === 0 || el.clientWidth === 0) return
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const node of nodes) {
      const p = placed.get(node.id)
      if (!p) continue
      const size = nodeSize(node.kind)
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x + size.width)
      maxY = Math.max(maxY, p.y + size.height)
    }
    const pad = 28
    const zoom = Math.min(1, (el.clientWidth - pad * 2) / Math.max(1, maxX - minX), (el.clientHeight - pad * 2) / Math.max(1, maxY - minY))
    if (!Number.isFinite(zoom) || zoom <= 0) return
    setViewport({ x: pad - minX * zoom, y: pad - minY * zoom, zoom }, { duration: 0 })
  }
  const frameRef = useRef(frameGraph)
  frameRef.current = frameGraph

  const reveal = (next: Map<string, Point>, fresh: string[]) => {
    const el = pane.current
    if (!el || fresh.length === 0 || reduced) return
    const vp = getViewport()
    const pad = 24
    let dx = 0
    let dy = 0
    for (const id of fresh) {
      const p = next.get(id)
      if (!p) continue
      const kind = graphRef.current.nodes.find((item) => item.id === id)?.kind ?? 'agent'
      const size = nodeSize(kind)
      const left = p.x * vp.zoom + vp.x
      const top = p.y * vp.zoom + vp.y
      const right = left + size.width * vp.zoom
      const bottom = top + size.height * vp.zoom
      if (left < pad) dx = Math.min(dx, left - pad)
      if (top < pad) dy = Math.min(dy, top - pad)
      if (right > el.clientWidth - pad) dx = Math.max(dx, right - (el.clientWidth - pad))
      if (bottom > el.clientHeight - pad) dy = Math.max(dy, bottom - (el.clientHeight - pad))
    }
    if (dx === 0 && dy === 0) return
    setViewport({ x: vp.x - dx, y: vp.y - dy, zoom: vp.zoom }, { duration: GROW_MS })
  }

  useEffect(() => {
    let cancel = false
    const { edges: liveEdges } = graphRef.current
    layoutGraph(graphRef.current.nodes, liveEdges).then((next) => {
      if (cancel) return
      const prev = posRef.current
      const fresh = [...next.keys()].filter((id) => !prev.has(id))
      const replaced = prev.size === 0 || fresh.length === next.size
      stopGrow.current()
      if (replaced || reduced) {
        posRef.current = next
        setPos(next)
        setBorn(new Set())
        if (replaced) {
          let tries = 0
          const fit = () => {
            tries += 1
            if ((pane.current?.clientWidth ?? 0) === 0 && tries < 8) {
              window.setTimeout(fit, 40)
              return
            }
            frameRef.current()
          }
          window.setTimeout(fit, 0)
        }
        return
      }
      const from = new Map(next)
      for (const [id, end] of next) {
        if (prev.has(id)) from.set(id, prev.get(id)!)
        else from.set(id, growOrigin(id, prev, next, liveEdges) ?? end)
      }
      posRef.current = from
      setPos(from)
      setBorn(new Set(fresh))
      reveal(next, fresh)
      stopGrow.current = startGrow(from, next, (frame) => {
        if (cancel) return
        posRef.current = frame
        setPos(frame)
      })
    })
    return () => {
      cancel = true
      stopGrow.current()
    }
  }, [sig, reduced])

  const flowNodes = useMemo(
    () =>
      nodes.flatMap((node) => {
        const position = pos.get(node.id)
        if (!position) return []
        const size = nodeSize(node.kind)
        return [{
        id: node.id,
        type: 'runtime' as const,
        position,
        width: size.width,
        height: size.height,
        initialWidth: size.width,
        initialHeight: size.height,
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        handles: [
          { type: 'target' as const, position: Position.Top, x: size.width / 2 - 3, y: 0, width: 6, height: 6 },
          { type: 'source' as const, position: Position.Bottom, x: size.width / 2 - 3, y: size.height - 6, width: 6, height: 6 },
        ],
        data: { ...node, selected: node.id === selectedId, born: born.has(node.id) } satisfies RuntimeNodeData,
        draggable: false,
        connectable: false,
        style: { width: size.width, height: size.height, opacity: dimmed(node, filter) ? 0.28 : 1 },
      }]
      }),
    [nodes, pos, selectedId, filter, born],
  )
  const flowEdges = useMemo<RuntimeFlowEdge[]>(
    () =>
      edges.filter((edge) => edge.kind !== 'message' && pos.has(edge.source) && pos.has(edge.target)).map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'runtime',
        label: edge.label,
        data: { kind: edge.kind, label: edge.label },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: EDGE_COLOR[edge.kind] ?? '#334155' },
      })),
    [edges, pos],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RuntimeGraphToolbar mode={mode} onMode={onMode} filter={filter} onFilter={setFilter} onZoomIn={() => zoomIn()} onZoomOut={() => zoomOut()} onFit={frameGraph} onReplay={onReplay} replaying={replaying} onLive={onLive} speed={speed} onSpeed={onSpeed} />
      <div ref={pane} className="relative min-h-0 flex-1" aria-label="运行时协同拓扑，只读。键盘用户请使用 Trace 列表。">
        <div className="sr-only" aria-live="polite">{liveMessage}</div>
        {nodes.length === 0 ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center text-sm text-gray-500">等待 Trigger。节点会随运行事件出现，不能在这里编排流程。</div>
        ) : null}
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges as Edge[]}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          panOnDrag
          zoomOnScroll
          onNodeClick={(_, node) => onSelect(node.id)}
          onPaneClick={() => onSelect('')}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={18} color="#e5e7eb" />
        </ReactFlow>
      </div>
    </div>
  )
}

export function RuntimeCanvas(props: Parameters<typeof CanvasBody>[0]) {
  return (
    <ReactFlowProvider>
      <CanvasBody {...props} />
    </ReactFlowProvider>
  )
}
