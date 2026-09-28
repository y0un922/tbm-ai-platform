import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listCapabilities } from '@/api/capabilities'
import { Badge, Card, EmptyState, ErrorState, Kpi, PageHeader, inputClass } from '@/components/ui/primitives'
import type { Capability, CapabilityKind } from '@/types'
import { formatRelative } from '@/utils/format'

const KIND: Record<CapabilityKind, string> = {
  data_source: '数据源',
  tool: '工具',
  api: 'API',
  mcp: 'MCP',
  model: '模型',
  knowledge: '知识库',
}

export function CapabilitiesPage() {
  const query = useQuery({ queryKey: ['capabilities'], queryFn: listCapabilities })
  const [kind, setKind] = useState<CapabilityKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string>()
  if (query.isError) return <ErrorState body={query.error.message} onRetry={() => query.refetch()} />
  const all = query.data ?? []
  const list = all.filter((item) => (kind === 'all' || item.kind === kind) && `${item.name} ${item.description} ${item.tags.join(' ')}`.includes(q))
  const current = list.find((item) => item.id === selected) ?? list[0]
  const count = (id: CapabilityKind) => all.filter((item) => item.kind === id).length
  const online = all.filter((item) => item.status === 'online').length
  return (
    <div className="space-y-4">
      <PageHeader title="数据与能力" sub="统一注册表。连接测试与真实调用属于后端，这里只展示契约槽位。" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="数据源" value={String(count('data_source'))} hint="已登记" />
        <Kpi label="工具" value={String(count('tool'))} hint="已登记" />
        <Kpi label="API" value={String(count('api'))} hint="已登记" />
        <Kpi label="MCP" value={String(count('mcp'))} hint="已登记" />
        <Kpi label="在线" value={all.length ? `${Math.round((online / all.length) * 1000) / 10}%` : '—'} hint={`${online} / ${all.length}`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Filter id="all" label={`全部 ${all.length}`} current={kind} onClick={setKind} />
        {(Object.keys(KIND) as CapabilityKind[]).map((id) => <Filter key={id} id={id} label={`${KIND[id]} ${count(id)}`} current={kind} onClick={setKind} />)}
        <input className={`${inputClass} ml-auto max-w-xs`} placeholder="搜索" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索能力" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500"><tr><th className="px-4 py-2 font-medium">名称</th><th className="px-2 py-2 font-medium">类型</th><th className="px-2 py-2 font-medium">状态</th><th className="px-2 py-2 font-medium">负责人</th><th className="px-4 py-2 font-medium">同步</th></tr></thead>
            <tbody>
              {list.map((item) => (
                <tr key={item.id} className={current?.id === item.id ? 'bg-indigo-50/60' : 'hover:bg-gray-50'} onClick={() => setSelected(item.id)}>
                  <td className="px-4 py-2"><button type="button" className="text-left"><b className="block font-medium">{item.name}</b><span className="text-xs text-gray-500">{item.description}</span></button></td>
                  <td className="px-2 py-2"><Badge tone="info">{KIND[item.kind]}</Badge></td>
                  <td className="px-2 py-2"><Status item={item} /></td>
                  <td className="px-2 py-2">{item.owner}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{formatRelative(item.syncedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <EmptyState title="没有能力" body="注册表为空或搜索无结果。" />}
        </Card>
        {current && (
          <Card className="p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{current.name}</h2><Status item={current} /></div>
            <p className="mt-2 text-sm text-gray-600">{current.description}</p>
            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-gray-500">Endpoint</dt><dd>{current.endpoint ?? '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">协议</dt><dd>{current.protocol ?? '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">延迟</dt><dd>{current.latencyMs != null ? `${current.latencyMs} ms` : '—'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-gray-500">关联 Agent</dt><dd className="text-right">{current.agentIds.join('、') || '—'}</dd></div>
            </dl>
            <p className="mt-4 text-xs text-gray-400">真实连通性测试由后端执行。当前端点标记为待接入。</p>
          </Card>
        )}
      </div>
    </div>
  )
}

function Filter({ id, label, current, onClick }: { id: CapabilityKind | 'all'; label: string; current: string; onClick: (id: CapabilityKind | 'all') => void }) {
  return <button type="button" aria-pressed={current === id} className={`rounded-lg px-3 py-1.5 text-sm ${current === id ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-600'}`} onClick={() => onClick(id)}>{label}</button>
}

function Status({ item }: { item: Capability }) {
  return <Badge tone={item.status === 'online' ? 'good' : item.status === 'degraded' ? 'warn' : 'bad'}>{item.status === 'online' ? '在线' : item.status === 'degraded' ? '降级' : '离线'}</Badge>
}
