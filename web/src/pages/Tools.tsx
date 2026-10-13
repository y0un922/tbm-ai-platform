// 工具与能力：已注册的工具、数据源、MCP、Skill、模型，以及本次会商中的实际调用
import { AGENTS, STAGES, type AgentId } from '@tbm/shared'
import { BookOpen, Boxes, Cpu, Database, PlugZap, Search, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Badge, Card, CardTitle, Kpi, PageHead, Tabs, type Tone } from '../components/kit.tsx'
import { CAPABILITIES, KIND_LABEL, STATUS_LABEL, type CapKind, type CapStatus, type Capability } from '../data/catalog.ts'
import type { ToolCall, ViewState } from '../state/reducer.ts'

const KIND_TONE: Record<CapKind, Tone> = { data: 'blue', collab: 'cyan', flow: 'blue', source: 'green', mcp: 'violet', skill: 'orange', model: 'red' }
const STATUS_TONE: Record<CapStatus, Tone> = { live: 'green', partial: 'orange', missing: 'gray', planned: 'gray' }
const FILTERS: ('all' | CapKind)[] = ['all', 'data', 'collab', 'flow', 'source', 'mcp', 'skill', 'model']

const agentLabel = (id: AgentId) => (id === 'coordinator' ? '协调' : AGENTS[id].name)
const stageLabel = (c: Capability) => (c.stages ? c.stages.map((s) => STAGES.find((x) => x.id === s)?.label ?? s).join(' · ') : '—')

/** 本次会商里每个工具被调用的记录 */
function callsByTool(state: ViewState) {
  const m = new Map<string, (ToolCall & { agentId: AgentId })[]>()
  for (const [agentId, v] of Object.entries(state.agents)) for (const t of v.tools) m.set(t.tool, [...(m.get(t.tool) ?? []), { ...t, agentId: agentId as AgentId }])
  return m
}

export function ToolsPage({ state }: { state: ViewState }) {
  const [filter, setFilter] = useState<'all' | CapKind>('all')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState('query_foam')
  const [tab, setTab] = useState<'overview' | 'params' | 'calls'>('overview')
  const calls = callsByTool(state)
  const totalCalls = [...calls.values()].reduce((n, x) => n + x.length, 0)
  const rows = CAPABILITIES.filter((c) => (filter === 'all' || c.kind === filter) && (!q || `${c.name}${c.id}${c.desc}`.toLowerCase().includes(q.toLowerCase())))
  const cur = CAPABILITIES.find((c) => c.id === sel)!
  const curCalls = calls.get(cur.id) ?? []
  const count = (k: CapKind) => CAPABILITIES.filter((c) => c.kind === k).length
  const live = (k: CapKind) => CAPABILITIES.filter((c) => c.kind === k && c.status !== 'missing' && c.status !== 'planned').length

  return (
    <>
      <PageHead title="工具与能力" desc="统一查看平台已注册的工具、数据源、MCP 服务、Skill 与模型，以及它们分配给了哪些 Agent。灰色条目为规划或未接入项。" />
      <div className="mb-3 grid grid-cols-5 gap-2.5">
        <Kpi icon={Wrench} label="已注册工具" value={count('data') + count('collab') + count('flow')} sub={`数据查询 ${count('data')} · 协作 ${count('collab')} · 主持 ${count('flow')}`} />
        <Kpi icon={Database} label="数据源" value={live('source')} unit={`/ ${count('source')}`} tone="green" sub={`${count('source') - live('source')} 项未接入`} />
        <Kpi icon={PlugZap} label="MCP 服务" value={live('mcp')} unit={`/ ${count('mcp')}`} tone="violet" sub={`${count('mcp') - live('mcp')} 项规划中`} />
        <Kpi icon={BookOpen} label="Skill" value={live('skill')} unit={`/ ${count('skill')}`} tone="orange" sub={`${count('skill') - live('skill')} 项规划中`} />
        <Kpi icon={Cpu} label="本次会商调用" value={totalCalls} tone="cyan" sub={state.status === 'idle' ? '尚未开始会商' : `覆盖 ${calls.size} 个工具`} />
      </div>

      <div className="mb-3 flex items-stretch gap-2">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-[7px] border px-3 py-1.5 text-center ${filter === f ? 'border-[#1975f2] bg-[#1975f2] text-white' : 'border-line bg-white text-[#425d7f] hover:bg-paper'}`}>
            {f === 'all' ? '全部' : KIND_LABEL[f]}
            <b className="block text-[11px]">{f === 'all' ? CAPABILITIES.length : count(f)}</b>
          </button>
        ))}
        <div className="relative flex-1">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索名称、ID 或描述…" className="h-full w-full rounded-[7px] border border-line bg-white pr-3 pl-9 outline-none focus:border-brand" />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_440px] gap-2.5">
        <Card>
          <CardTitle sub={`共 ${rows.length} 项`}>能力清单</CardTitle>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-paper-2 text-left text-[#647792]">
                {['名称', '类型', '状态', '可用 Agent', '可用阶段', '本次调用'].map((h) => <th key={h} className="border-b border-[#e8edf4] px-2.5 py-2.5 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const n = calls.get(c.id)?.length ?? 0
                const dim = c.status === 'planned' || c.status === 'missing'
                return (
                  <tr key={c.id} onClick={() => setSel(c.id)} className={`cursor-pointer border-b border-[#e8edf4] ${c.id === sel ? 'bg-[#eef6ff]' : 'hover:bg-paper-2'} ${dim ? 'text-faint' : ''}`}>
                    <td className="px-2.5 py-2.5">
                      <b className={`text-[13px] ${dim ? 'text-muted' : 'text-ink'}`}>{c.name}</b>
                      <small className="mt-0.5 block font-mono text-[11px] text-[#7b8da5]">{c.id}</small>
                    </td>
                    <td className="px-2.5"><Badge tone={KIND_TONE[c.kind]}>{KIND_LABEL[c.kind]}</Badge></td>
                    <td className="px-2.5"><Badge tone={STATUS_TONE[c.status]} dot>{STATUS_LABEL[c.status]}</Badge></td>
                    <td className="max-w-[220px] px-2.5">
                      <span className="flex flex-wrap gap-1">
                        {c.agents.length === 5 ? <span className="rounded-[5px] bg-[#edf4ff] px-1.5 py-0.5 text-[#40669c]">全部</span>
                          : c.agents.length === 4 && !c.agents.includes('coordinator') ? <span className="rounded-[5px] bg-[#edf4ff] px-1.5 py-0.5 text-[#40669c]">四位专家</span>
                          : c.agents.map((a) => <span key={a} className="rounded-[5px] bg-[#edf4ff] px-1.5 py-0.5 text-[#40669c]">{agentLabel(a)}</span>)}
                        {c.agents.length === 0 && '—'}
                      </span>
                    </td>
                    <td className="px-2.5 text-[#526983]">{stageLabel(c)}</td>
                    <td className="px-2.5 font-semibold tabular-nums">{n || <span className="font-normal text-faint">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

        <Card className="self-start">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-[#edf4ff] text-[#1870ee]"><Boxes size={18} /></span>
              <span className="text-[18px] font-bold">{cur.name}</span>
            </div>
            <Badge tone={STATUS_TONE[cur.status]} dot>{STATUS_LABEL[cur.status]}</Badge>
          </div>
          <p className="mt-2 text-[#526983]">{cur.desc}</p>
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: '概览' }, { id: 'params', label: `参数${cur.params ? ` · ${cur.params.length}` : ''}` }, { id: 'calls', label: `调用记录 · ${curCalls.length}` }]} />

          {tab === 'overview' && (
            <div className="flex flex-col gap-2.5 text-[13px]">
              {[
                ['标识', <span className="font-mono">{cur.id}</span>],
                ['类型', KIND_LABEL[cur.kind]],
                ['可用 Agent', cur.agents.length ? cur.agents.map(agentLabel).join('、') : '—'],
                ['可用阶段', stageLabel(cur)],
                ['调用配额', cur.quota ?? '不限'],
                ['提供方', cur.owner ?? '平台内置'],
                ['接入点', cur.endpoint ?? (['data', 'collab', 'flow'].includes(cur.kind) ? 'Agent 工具（服务端注册）' : '—')],
              ].map(([k, v]) => (
                <div key={k as string} className="grid grid-cols-[90px_1fr] gap-2.5"><span className="text-[#74849d]">{k}</span><b className="font-semibold">{v}</b></div>
              ))}
              {(cur.status === 'planned' || cur.status === 'missing') && (
                <div className="mt-1 rounded-lg border border-[#f3e2bf] bg-[#fffaf0] p-3 text-[#8a6116]">
                  {cur.status === 'planned' ? '规划项，尚未接入。接入后可在「Agent 配置」中分配给对应 Agent。' : '数据尚未接入。会商中专家需要这部分信息时，只能通过「向现场提问」获得。'}
                </div>
              )}
              {cur.kind === 'data' && <div className="mt-1 rounded-lg border border-[#cdeedf] bg-[#eefaf5] p-3 text-[#3d6554]">数据域隔离：只有 {cur.agents.map(agentLabel).join('、')} 能调用。其他专家需要这份数据时，必须向他追问。</div>}
            </div>
          )}

          {tab === 'params' && (cur.params?.length ? (
            <table className="w-full text-[12px]">
              <thead><tr className="text-left text-[#647792]"><th className="py-2 font-semibold">参数</th><th className="font-semibold">类型</th><th className="font-semibold">说明</th></tr></thead>
              <tbody>
                {cur.params.map((p) => (
                  <tr key={p.name} className="border-t border-[#edf1f6]">
                    <td className="py-2 pr-2 font-mono text-ink">{p.name}</td>
                    <td className="pr-2 font-mono text-[#7551d7]">{p.type}</td>
                    <td className="text-[#526983]">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-muted">{cur.params ? '无参数' : '不适用'}</p>)}

          {tab === 'calls' && (curCalls.length ? (
            <div className="max-h-[520px] space-y-2 overflow-y-auto">
              {curCalls.map((t) => (
                <div key={t.callId} className="rounded-lg border border-[#e5ebf3] p-2.5">
                  <div className="flex items-center gap-2 text-[12px]">
                    <b className="shrink-0 whitespace-nowrap">{agentLabel(t.agentId)}</b>
                    <span className="truncate font-mono text-faint">{JSON.stringify(t.args)}</span>
                    <span className="ml-auto shrink-0">{!t.result ? <Badge>执行中</Badge> : t.result.isError ? <Badge tone="red">出错</Badge> : <Badge tone="green">成功</Badge>}</span>
                  </div>
                  {t.result && <p className={`mt-1 line-clamp-2 text-[12px] ${t.result.isError ? 'text-bad' : 'text-[#526983]'}`}>{t.result.summary}</p>}
                </div>
              ))}
            </div>
          ) : <p className="rounded-lg bg-paper-2 p-4 text-muted">{state.status === 'idle' ? '还没有会商记录。开始一次会商后，这里显示每次调用的参数和结果。' : '本次会商中未调用。'}</p>)}
        </Card>
      </div>
    </>
  )
}
