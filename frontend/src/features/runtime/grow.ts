import type { GraphEdgeModel } from '@/types'
import { NODE_H } from '@/features/runtime/layoutGraph'

export type Point = { x: number; y: number }

/** cubic-bezier(0.77, 0, 0.175, 1) — on-screen move, not a hand-rolled curve. */
export function easeMove(t: number) {
  return bezierY(t, 0.77, 0, 0.175, 1)
}

function bezierY(t: number, x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1
  const bx = 3 * (x2 - x1) - cx
  const ax = 1 - cx - bx
  const cy = 3 * y1
  const by = 3 * (y2 - y1) - cy
  const ay = 1 - cy - by
  const x = (u: number) => ((ax * u + bx) * u + cx) * u
  const y = (u: number) => ((ay * u + by) * u + cy) * u
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx
  let u = t
  for (let i = 0; i < 6; i++) {
    const slope = dx(u)
    if (Math.abs(slope) < 1e-6) break
    u = Math.min(1, Math.max(0, u - (x(u) - t) / slope))
  }
  return y(u)
}

function parentOf(id: string, edges: GraphEdgeModel[]) {
  return edges.find((edge) => edge.target === id && edge.kind !== 'message' && edge.kind !== 'result')?.source
}

/** Where a new node should start: the parent's bottom handle, not the canvas origin. */
export function growOrigin(
  id: string,
  prev: Map<string, Point>,
  next: Map<string, Point>,
  edges: GraphEdgeModel[],
  seen = new Set<string>(),
): Point | null {
  if (seen.has(id)) return null
  seen.add(id)
  const parent = parentOf(id, edges)
  if (!parent) return null
  const base = prev.get(parent) ?? next.get(parent)
  if (prev.has(parent) && base) return { x: base.x, y: base.y + NODE_H }
  const above = growOrigin(parent, prev, next, edges, seen)
  if (above) return above
  return base ? { x: base.x, y: base.y + NODE_H } : null
}
