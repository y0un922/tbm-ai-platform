import ELK from 'elkjs/lib/elk.bundled.js'
import type { GraphEdgeModel, GraphNodeModel } from '@/types'

export const NODE_W = 232
export const NODE_H = 84
export const TOOL_W = 160
export const TOOL_H = 52

export function nodeSize(kind: GraphNodeModel['kind']) {
  if (kind === 'tool' || kind === 'api' || kind === 'mcp' || kind === 'data_source') return { width: TOOL_W, height: TOOL_H }
  return { width: NODE_W, height: NODE_H }
}

const elk = new ELK()

function partition(kind: GraphNodeModel['kind']) {
  if (kind === 'trigger') return '0'
  if (kind === 'coordinator') return '1'
  if (kind === 'agent' || kind === 'sub_agent') return '2'
  if (kind === 'human_review') return '4'
  return '3'
}

export async function layoutGraph(nodes: GraphNodeModel[], edges: GraphEdgeModel[]) {
  if (nodes.length === 0) return new Map<string, { x: number; y: number }>()
  try {
    const laid = await elk.layout({
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.partitioning.activate': 'true',
        'elk.spacing.nodeNode': '48',
        'elk.layered.spacing.nodeNodeBetweenLayers': '72',
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
        'elk.layered.nodePlacement.bk.fixedAlignment': 'BALANCED',
        'elk.separateConnectedComponents': 'false',
        'elk.padding': '[top=16,left=16,bottom=16,right=16]',
      },
      children: nodes.map((n) => {
        const size = nodeSize(n.kind)
        return {
          id: n.id,
          width: size.width,
          height: size.height,
          layoutOptions: { 'elk.partitioning.partition': partition(n.kind) },
        }
      }),
      edges: edges
        .filter((e) => e.kind !== 'message' && nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target))
        .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
    })
    const pos = new Map<string, { x: number; y: number }>()
    for (const child of laid.children ?? []) pos.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
    return pos
  } catch {
    const pos = new Map<string, { x: number; y: number }>()
    nodes.forEach((n, i) => pos.set(n.id, { x: 24, y: 24 + i * (NODE_H + 36) }))
    return pos
  }
}
