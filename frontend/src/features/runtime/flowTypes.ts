import type { Edge } from '@xyflow/react'
import type { GraphEdgeKind, GraphNodeModel } from '@/types'

export type RuntimeNodeData = GraphNodeModel & { selected: boolean; born?: boolean }
export type RuntimeFlowEdge = Edge<{ kind: GraphEdgeKind; label: string }>
