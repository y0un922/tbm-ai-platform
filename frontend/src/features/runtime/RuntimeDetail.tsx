import type { ReactNode } from 'react'
import { Wrench, X } from 'lucide-react'
import type { GraphNodeModel, RuntimeEvent } from '@/types'
import { TRIGGER_TYPE_LABEL } from '@/features/runtime/labels'
import { Markdown } from '@/components/ui/Markdown'
import { formatDuration, formatTime, str } from '@/utils/format'
import { NodeStatusText } from '@/components/ui/primitives'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h4 className="text-[11px] font-semibold tracking-[0.08em] text-black/35 uppercase">{title}</h4>
      <div className="mt-2 text-[15px] leading-[1.47] tracking-[-0.01em] text-neutral-900">{children}</div>
    </section>
  )
}

function pretty(value: unknown) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function AgentTranscript({ node, events, goal }: { node: GraphNodeModel; events: RuntimeEvent[]; goal?: string }) {
  const agentId = str(node.detail, 'agentId', node.actorId.replace(/^agent:/, ''))
  const mine = (event: RuntimeEvent) => str(event.data, 'agentId', event.sourceId ?? '') === agentId
  const delegated = events.find((event) => event.type === 'agent.delegated' && str(event.data, 'agentId') === agentId)
  const task = str(delegated?.data, 'task') || (agentId === 'coordinator' ? (goal ?? '') : '')
  const rows = events.filter((event) => mine(event) && (event.type === 'agent.thinking' || event.type === 'agent.message' || event.type === 'tool.called' || event.type === 'api.called' || event.type === 'mcp.called'))
  return (
    <div className="space-y-3 px-5 pb-5">
      {task && (
        <div className="ml-6 rounded-[18px] bg-[#0071e3] px-3.5 py-2.5 text-[14px] leading-relaxed tracking-[-0.01em] text-white">{task}</div>
      )}
      {rows.map((event) => {
        if (event.type === 'agent.thinking') {
          const text = str(event.data, 'text')
          if (!text) return null
          return (
            <details key={event.id} className="rounded-xl bg-black/[0.04] px-3 py-2">
              <summary className="cursor-pointer text-[13px] text-black/40">思考</summary>
              <div className="mt-2"><Markdown className="text-[13px] text-black/55" text={text} /></div>
            </details>
          )
        }
        if (event.type === 'agent.message') {
          const text = str(event.data, 'text')
          if (!text) return null
          return (
            <div key={event.id} className="mr-4 rounded-[18px] bg-black/[0.05] px-3.5 py-2.5 text-[15px] leading-[1.47] tracking-[-0.011em] text-neutral-900">
              <Markdown text={text} />
            </div>
          )
        }
        return (
          <details key={event.id} className="overflow-hidden rounded-xl ring-1 ring-black/[0.06]">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px]">
              <Wrench className="size-3.5 shrink-0 text-black/35" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">{str(event.data, 'name', event.type)}</span>
              <span className="shrink-0 tabular-nums text-[11px] text-black/35">{formatDuration(Number(event.data.durationMs) || 0)}</span>
            </summary>
            <div className="space-y-2 border-t border-black/[0.06] px-3 py-2">
              {pretty(event.data.input) && <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-black/50">{pretty(event.data.input)}</pre>}
              {pretty(event.data.output) && <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-black/65">{pretty(event.data.output)}</pre>}
            </div>
          </details>
        )
      })}
      {rows.length === 0 && !task && <p className="text-[13px] text-black/40">还没有思考或工具记录。</p>}
    </div>
  )
}

export function RuntimeDetail({
  node,
  events,
  runId,
  goal,
  onClose,
}: {
  node?: GraphNodeModel
  events: RuntimeEvent[]
  runId?: string
  goal?: string
  onClose?: () => void
}) {
  if (!node) return null
  const transcript = node.kind === 'agent' || node.kind === 'coordinator' || node.kind === 'sub_agent'
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-black/35 uppercase">{node.typeLabel}</p>
          <h3 className="mt-1 text-[21px] font-semibold tracking-[-0.022em] text-neutral-950">{node.name}</h3>
          <div className="mt-1"><NodeStatusText status={node.status} /></div>
        </div>
        {onClose && (
          <button type="button" className="grid size-7 shrink-0 place-items-center rounded-full bg-black/5 text-black/50 transition-transform duration-100 ease-out active:scale-95" onClick={onClose} aria-label="关闭">
            <X className="size-3.5" />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto [scrollbar-width:thin]">
        {transcript ? (
          <AgentTranscript node={node} events={events} goal={goal} />
        ) : node.kind === 'trigger' ? (
          <>
            <Block title="规则">{str(node.detail, 'rule', '—')}</Block>
            <Block title="实际 / 阈值">{String(node.detail.actual ?? '—')} · {String(node.detail.threshold ?? '—')}</Block>
            <Block title="来源">{str(node.detail, 'source', '—')} · {TRIGGER_TYPE_LABEL[str(node.detail, 'triggerType') as keyof typeof TRIGGER_TYPE_LABEL] ?? str(node.detail, 'triggerType')} · {formatTime(node.startedAt)}</Block>
            {str(node.detail, 'summary') && <Block title="摘要">{str(node.detail, 'summary')}</Block>}
            {runId && <Block title="运行"><span className="break-all text-[13px] text-black/50">{runId}</span></Block>}
          </>
        ) : node.kind === 'human_review' ? (
          <>
            <Block title="原因">{str(node.detail, 'reason', '—')}</Block>
            <Block title="结果"><p className="whitespace-pre-wrap break-words">{str(node.detail, 'result', '—')}</p></Block>
            {str(node.detail, 'risk') && <Block title="风险">{str(node.detail, 'risk')}</Block>}
            {str(node.detail, 'recommendation') && <Block title="建议">{str(node.detail, 'recommendation')}</Block>}
          </>
        ) : (
          <Block title="调用">
            {pretty(node.detail.input) && <pre className="whitespace-pre-wrap break-words text-[12px] text-black/50">{pretty(node.detail.input)}</pre>}
            {pretty(node.detail.output) && <pre className="mt-2 whitespace-pre-wrap break-words text-[12px] text-black/65">{pretty(node.detail.output)}</pre>}
            {!pretty(node.detail.input) && !pretty(node.detail.output) && <span className="text-black/40">无载荷</span>}
          </Block>
        )}
      </div>
    </div>
  )
}

export function TraceTree({ nodes, edges, selectedId, onSelect }: { nodes: GraphNodeModel[]; edges: { source: string; target: string; label: string }[]; selectedId?: string; onSelect: (id: string) => void }) {
  const children = new Map<string, string[]>()
  const incoming = new Set<string>()
  for (const edge of edges) {
    incoming.add(edge.target)
    children.set(edge.source, [...(children.get(edge.source) ?? []), edge.target])
  }
  const roots = nodes.filter((node) => !incoming.has(node.id))
  const render = (id: string, depth: number, path: Set<string>): ReactNode => {
    if (path.has(id) || depth > 16) return null
    const node = nodes.find((item) => item.id === id)
    if (!node) return null
    const next = new Set(path)
    next.add(id)
    return (
      <li key={`${id}-${depth}`}>
        <button type="button" className={`block w-full rounded-md px-2 py-1 text-left text-sm ${selectedId === id ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-gray-50'}`} style={{ paddingLeft: 8 + depth * 12 }} onClick={() => onSelect(id)}>
          <span className="text-[10px] text-gray-400">{node.typeLabel}</span> {node.name}
        </button>
        {(children.get(id) ?? []).length > 0 && <ul>{(children.get(id) ?? []).map((child) => render(child, depth + 1, next))}</ul>}
      </li>
    )
  }
  if (roots.length === 0) return <p className="p-3 text-sm text-gray-500">还没有 Trace。</p>
  return <ul className="p-2">{roots.map((node) => render(node.id, 0, new Set()))}</ul>
}
