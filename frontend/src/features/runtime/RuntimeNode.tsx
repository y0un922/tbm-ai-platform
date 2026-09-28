import type { ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Bot, Boxes, Database, GitBranch, Plug, UserCheck, Waypoints, Wrench, Zap } from 'lucide-react'
import type { GraphNodeKind } from '@/types'
import { NodeStatusText } from '@/components/ui/primitives'
import { formatDuration } from '@/utils/format'
import { cn } from '@/utils/cn'
import type { RuntimeNodeData } from '@/features/runtime/flowTypes'

const ICONS: Record<GraphNodeKind, typeof Bot> = {
  trigger: Zap,
  coordinator: Waypoints,
  agent: Bot,
  sub_agent: GitBranch,
  tool: Wrench,
  api: Plug,
  mcp: Boxes,
  data_source: Database,
  human_review: UserCheck,
}

function clip(text: string, n = 28) {
  const first = text.split(/[。；\n]/)[0]?.trim() || text
  return first.length <= n ? first : `${first.slice(0, n)}…`
}

const ACCENT: Record<GraphNodeKind, string> = {
  trigger: 'border-l-indigo-500',
  coordinator: 'border-l-slate-800',
  agent: 'border-l-sky-600',
  sub_agent: 'border-l-violet-600',
  tool: 'border-l-emerald-600',
  api: 'border-l-cyan-600',
  mcp: 'border-l-amber-600',
  data_source: 'border-l-gray-400',
  human_review: 'border-l-orange-500',
}

export function NodeShell({ data, children }: { data: RuntimeNodeData; children?: ReactNode }) {
  const Icon = ICONS[data.kind]
  const lead = data.kind === 'coordinator'
  const gate = data.kind === 'human_review'
  const calls = Number(data.detail.callCount) || 0
  const subtitle = typeof data.detail.summary === 'string' && data.detail.summary
    ? clip(data.detail.summary)
    : calls > 0
      ? `${calls} 次调用`
      : formatDuration(data.durationMs) + (data.count > 1 ? ` · ×${data.count}` : '')
  return (
    <div className={cn('relative h-[84px] w-[232px] rounded-xl border px-3 py-2 shadow-sm', lead ? 'border-transparent bg-[#1d1d1f] text-white' : gate ? 'border-amber-200 bg-amber-50' : 'border-gray-200 border-l-4 bg-white', !lead && !gate && ACCENT[data.kind], data.selected && 'ring-2 ring-brand', data.born && 'runtime-node-born')} aria-label={`${data.typeLabel} ${data.name} ${data.status}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} className={cn('!size-1.5 !border-0', lead ? '!bg-white/40' : '!bg-gray-300')} />
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide uppercase', lead ? 'text-white/50' : 'text-gray-500')}>
          <Icon className="size-3.5" aria-hidden />
          {data.typeLabel}
        </span>
        <span className={lead ? 'text-white/70' : undefined}><NodeStatusText status={data.status} /></span>
      </div>
      <div className={cn('mt-1 truncate text-sm font-semibold', lead ? 'text-white' : 'text-gray-900')} title={data.name}>{data.name}</div>
      <div className={cn('mt-0.5 truncate text-[11px]', lead ? 'text-white/55' : 'text-gray-500')} title={typeof data.detail.summary === 'string' ? data.detail.summary : undefined}>
        {subtitle}
        {children}
      </div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className={cn('!size-1.5 !border-0', lead ? '!bg-white/40' : '!bg-gray-300')} />
    </div>
  )
}

export function RuntimeNode({ data }: NodeProps) {
  const node = data as unknown as RuntimeNodeData
  if (node.kind === 'trigger') return <TriggerNode data={node} />
  if (node.kind === 'human_review') return <HumanReviewNode data={node} />
  if (node.kind === 'tool' || node.kind === 'api' || node.kind === 'mcp' || node.kind === 'data_source') return <ToolNode data={node} />
  return <AgentNode data={node} />
}

export function TriggerNode({ data }: { data: RuntimeNodeData }) {
  return <NodeShell data={data} />
}

export function AgentNode({ data }: { data: RuntimeNodeData }) {
  return <NodeShell data={data} />
}

export function ToolNode({ data }: { data: RuntimeNodeData }) {
  const Icon = ICONS[data.kind]
  return (
    <div className={cn('relative h-[52px] w-[160px] rounded-[12px] bg-[#f5f5f7] px-2.5 py-1.5', data.selected && 'ring-2 ring-brand', data.born && 'runtime-node-born')} aria-label={`${data.typeLabel} ${data.name} ${data.status}`}>
      <Handle type="target" position={Position.Top} isConnectable={false} className="!size-1.5 !border-0 !bg-gray-300" />
      <div className="flex items-center gap-1 text-[10px] text-black/35">
        <Icon className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{data.typeLabel}</span>
        {data.count > 1 && <span className="tabular-nums">×{data.count}</span>}
      </div>
      <div className="mt-0.5 truncate text-[13px] font-medium text-black/70" title={data.name}>{data.name}</div>
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="!size-1.5 !border-0 !bg-gray-300" />
    </div>
  )
}

export function HumanReviewNode({ data }: { data: RuntimeNodeData }) {
  return <NodeShell data={data} />
}
