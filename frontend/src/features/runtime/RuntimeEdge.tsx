import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import type { RuntimeFlowEdge } from '@/features/runtime/flowTypes'

const STYLE: Record<string, { stroke: string; dash?: string }> = {
  trigger: { stroke: '#6366f1' },
  delegate: { stroke: '#334155' },
  spawn: { stroke: '#7c3aed', dash: '4 4' },
  message: { stroke: '#64748b', dash: '1 4' },
  tool_call: { stroke: '#059669' },
  api_call: { stroke: '#0284c7' },
  mcp_call: { stroke: '#d97706' },
  data: { stroke: '#94a3b8', dash: '2 3' },
  review: { stroke: '#f59e0b' },
  result: { stroke: '#10b981', dash: '5 3' },
}

export function RuntimeEdge(props: EdgeProps<RuntimeFlowEdge>) {
  const kind = props.data?.kind ?? 'delegate'
  const style = STYLE[kind] ?? STYLE.delegate
  const [path] = getSmoothStepPath(props)
  return <BaseEdge id={props.id} path={path} style={{ stroke: style.stroke, strokeWidth: kind === 'review' ? 2 : 1.5, strokeDasharray: style.dash }} markerEnd={props.markerEnd} />
}
