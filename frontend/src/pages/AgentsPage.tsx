import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listAgents, updateAgent } from '@/api/agents'
import { listCapabilities } from '@/api/capabilities'
import { useRoute } from '@/app/router'
import { Badge, Button, EmptyState, ErrorState, Field, Skeleton, inputClass } from '@/components/ui/primitives'
import { toast } from '@/components/ui/primitives'
import type { AgentRecord, CapabilityKind } from '@/types'

const TOOL_LABEL: Record<string, string> = {
  query_geology: '地质数据库',
  query_ring_metrics: '环数据',
  write_evidence: '写入证据',
  write_conclusion: '综合结论',
  request_review: '请求审核',
  query_foam: '泡沫系统',
  query_lab_muck: '渣土化验',
}

export function AgentsPage() {
  const { params, navigate } = useRoute()
  const qc = useQueryClient()
  const agents = useQuery({ queryKey: ['agents'], queryFn: listAgents })
  const caps = useQuery({ queryKey: ['capabilities'], queryFn: listCapabilities })
  const [q, setQ] = useState('')
  const list = (agents.data ?? []).filter((agent) => `${agent.name} ${agent.role} ${agent.description}`.includes(q))
  const selected = list.find((agent) => agent.id === params.get('agent')) ?? list[0]
  if (agents.isPending) return <Skeleton className="h-40" />
  if (agents.isError) return <ErrorState body={agents.error.message} onRetry={() => agents.refetch()} />
  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[32rem] overflow-hidden rounded-[20px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/5">
      <aside className="flex w-[232px] shrink-0 flex-col bg-[#f5f5f7]">
        <div className="px-4 pt-5 pb-3">
          <h1 className="text-[22px] font-semibold tracking-[-0.022em] text-neutral-950">Agent</h1>
          <p className="mt-1 text-[13px] leading-snug text-black/40">职责与 prompt</p>
          <input className="mt-3 w-full rounded-xl border-0 bg-black/[0.05] px-3 py-2 text-[13px] outline-none ring-0" placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索 Agent" />
        </div>
        {list.length === 0 && <EmptyState title="没有匹配的 Agent" body="调整搜索条件。" />}
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {list.map((agent) => (
            <li key={agent.id}>
              <button type="button" onClick={() => navigate(`/agents?agent=${agent.id}`)} className={`flex w-full items-center justify-between gap-2 rounded-[12px] px-3 py-2.5 text-left transition-colors duration-100 ${selected?.id === agent.id ? 'bg-white shadow-sm' : 'hover:bg-black/[0.04]'}`}>
                <span className="min-w-0">
                  <b className="block truncate text-[15px] font-medium tracking-[-0.01em]">{agent.name}</b>
                  <span className="block truncate text-[12px] text-black/40">{agent.role}</span>
                </span>
                <span className={`size-1.5 shrink-0 rounded-full ${agent.status === 'online' ? 'bg-emerald-500' : agent.status === 'standby' ? 'bg-black/20' : 'bg-red-400'}`} aria-label={agent.status} />
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {selected && <AgentDoc agent={selected} capabilities={caps.data ?? []} onSaved={() => { qc.invalidateQueries({ queryKey: ['agents'] }); toast('Agent 配置已保存') }} />}
    </div>
  )
}

function AgentDoc({ agent, capabilities, onSaved }: { agent: AgentRecord; capabilities: { id: string; name: string; kind: CapabilityKind }[]; onSaved: () => void }) {
  const [draft, setDraft] = useState(agent)
  const [prev, setPrev] = useState(agent.id)
  if (agent.id !== prev) {
    setPrev(agent.id)
    setDraft(agent)
  }
  const save = useMutation({ mutationFn: () => updateAgent(agent.id, draft), onSuccess: onSaved, onError: (error: Error) => toast(error.message) })
  const groups = useMemo(() => ({
    toolIds: capabilities.filter((item) => item.kind === 'tool'),
    apiIds: capabilities.filter((item) => item.kind === 'api'),
    mcpIds: capabilities.filter((item) => item.kind === 'mcp'),
    dataSourceIds: capabilities.filter((item) => item.kind === 'data_source'),
  }), [capabilities])
  const toggle = (key: keyof typeof groups, id: string) => {
    const current = draft[key]
    setDraft({ ...draft, [key]: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] })
  }
  const tools = draft.runtimeTools?.length ? draft.runtimeTools : [...draft.toolIds, ...draft.apiIds, ...draft.mcpIds]
  return (
    <article className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto px-10 py-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-[28px] font-semibold tracking-[-0.03em] text-neutral-950">{draft.name}</h2>
            <p className="mt-1 text-[15px] text-black/45">{draft.role} · {draft.owner}</p>
          </div>
          <Badge tone={draft.status === 'online' ? 'good' : draft.status === 'standby' ? 'neutral' : 'bad'}>{draft.status === 'online' ? '在线' : draft.status === 'standby' ? '待机' : '离线'}</Badge>
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 sm:items-stretch">
          <section className="rounded-2xl bg-[#f5f5f7] px-5 py-4">
            <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/35 uppercase">职责</h3>
            <p className="mt-2 text-[15px] leading-[1.47] tracking-[-0.01em] text-neutral-900">{draft.description}</p>
          </section>
          <section className="rounded-2xl bg-[#f5f5f7] px-1 py-1">
            <h3 className="px-4 pt-3 text-[11px] font-semibold tracking-[0.08em] text-black/35 uppercase">运行时工具</h3>
            <ul className="mt-1">
              {tools.length === 0 ? <li className="px-4 py-2 text-[15px] text-black/35">无</li> : tools.map((item, index) => (
                <li key={item} className={`flex items-center justify-between gap-4 px-4 py-2.5 ${index > 0 ? 'border-t border-black/5' : ''}`}>
                  <span className="text-[15px]">{TOOL_LABEL[item] ?? item}</span>
                  <span className="truncate text-[12px] text-black/30">{item}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section className="mt-3 rounded-2xl bg-[#f5f5f7] px-5 py-5">
          <h3 className="text-[11px] font-semibold tracking-[0.08em] text-black/35 uppercase">System prompt</h3>
          <p className="mt-3 max-w-[42em] text-[17px] leading-[1.47] tracking-[-0.011em] text-neutral-900">{draft.instructions}</p>
          <p className="mt-4 text-[12px] text-black/35">运行时追加禁止 PLC，必须用工具取数 · {draft.version}</p>
        </section>
        <details className="mt-6">
          <summary className="cursor-pointer text-[13px] text-black/40">编辑</summary>
          <div className="mt-3 space-y-3">
            <Field label="名称"><input className={inputClass} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
            <Field label="描述"><textarea className={inputClass} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <Field label="System prompt"><textarea className={inputClass} rows={8} value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} /></Field>
            {(Object.keys(groups) as (keyof typeof groups)[]).map((key) => (
              <fieldset key={key}>
                <legend className="mb-1 text-xs font-medium text-gray-600">{key}</legend>
                <div className="flex flex-wrap gap-2">
                  {groups[key].map((item) => (
                    <label key={item.id} className="flex items-center gap-1.5 text-sm">
                      <input type="checkbox" checked={draft[key].includes(item.id)} onChange={() => toggle(key, item.id)} />
                      {item.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? '保存中' : '保存'}</Button>
          </div>
        </details>
      </div>
    </article>
  )
}
