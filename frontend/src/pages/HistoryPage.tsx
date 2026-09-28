import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listRuns } from '@/api/runs'
import { navigate } from '@/app/router'
import { Button, Card, EmptyState, ErrorState, Kpi, PageHeader, RunStatusText, SeverityText, inputClass } from '@/components/ui/primitives'
import { useProjectId } from '@/hooks/useProject'
import { TRIGGER_TYPE_LABEL } from '@/features/runtime/labels'
import { formatDuration, formatTime, startOfToday } from '@/utils/format'
import type { RunStatus } from '@/types'

export function HistoryPage() {
  const { projectId } = useProjectId()
  const query = useQuery({ queryKey: ['runs', projectId], queryFn: () => listRuns(projectId), refetchInterval: 4000 })
  const [status, setStatus] = useState<RunStatus | 'all'>('all')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<string>()
  if (query.isError) return <ErrorState body={query.error.message} onRetry={() => query.refetch()} />
  const all = query.data ?? []
  const today = all.filter((run) => new Date(run.startedAt).getTime() >= startOfToday())
  const success = today.filter((run) => run.status === 'completed')
  const list = all.filter((run) => (status === 'all' || run.status === status) && `${run.goal} ${run.id} ${run.trigger.name}`.includes(q))
  const current = list.find((run) => run.id === selected) ?? list[0]
  const avg = success.length ? success.reduce((sum, run) => sum + (run.durationMs ?? 0), 0) / success.length : undefined
  return (
    <div className="space-y-4">
      <PageHeader title="运行记录" sub="每一次 Run 的触发、参与者和结果。回放在运行视图中进行。" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="今日运行" value={String(today.length)} hint="含进行中" />
        <Kpi label="今日完成" value={String(success.length)} hint={today.length ? `${Math.round((success.length / today.length) * 100)}%` : '—'} tone="good" />
        <Kpi label="平均耗时" value={avg == null ? '—' : formatDuration(avg)} hint="今日已完成" />
        <Kpi label="待审核" value={String(all.filter((run) => run.humanReview?.status === 'pending').length)} hint="尚未决定" tone="warn" />
      </div>
      <div className="flex flex-wrap gap-2">
        <input className={`${inputClass} max-w-xs`} placeholder="搜索目标或 Run ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索运行" />
        <select className={`${inputClass} max-w-[140px]`} value={status} onChange={(e) => setStatus(e.target.value as RunStatus | 'all')} aria-label="状态">
          <option value="all">全部状态</option>
          <option value="running">运行中</option>
          <option value="review">待审核</option>
          <option value="completed">完成</option>
          <option value="failed">失败</option>
        </select>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-gray-500"><tr><th className="px-4 py-2 font-medium">Run</th><th className="px-2 py-2 font-medium">目标</th><th className="px-2 py-2 font-medium">状态</th><th className="px-2 py-2 font-medium">Agent</th><th className="px-4 py-2 font-medium">耗时</th></tr></thead>
            <tbody>
              {list.map((run) => (
                <tr key={run.id} className={current?.id === run.id ? 'bg-indigo-50/60' : 'hover:bg-gray-50'} onClick={() => setSelected(run.id)}>
                  <td className="px-4 py-2 text-xs text-gray-500">{run.id}</td>
                  <td className="px-2 py-2"><button type="button" className="text-left font-medium">{run.goal}</button><div className="text-xs text-gray-400">{formatTime(run.startedAt)}</div></td>
                  <td className="px-2 py-2"><RunStatusText status={run.status} /></td>
                  <td className="px-2 py-2 tabular-nums">{run.participatingAgentIds.length}</td>
                  <td className="px-4 py-2 tabular-nums">{formatDuration(run.durationMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length === 0 && <EmptyState title="没有运行记录" body="提交目标或等待 Trigger 后会出现在这里。" />}
        </Card>
        {current && (
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">运行详情</h2><RunStatusText status={current.status} /></div>
            <p className="text-sm text-gray-800">{current.goal}</p>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-gray-500">Trigger</dt><dd>{current.trigger.name}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">类型</dt><dd>{TRIGGER_TYPE_LABEL[current.trigger.type]}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">来源</dt><dd>{current.trigger.source}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">派生</dt><dd>{current.spawnedAgentIds.length}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">调用</dt><dd>{current.toolCallCount}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-gray-500">审核</dt><dd>{current.humanReview ? current.humanReview.status : '无'}</dd></div>
              {current.riskLevel && <div className="flex justify-between gap-2"><dt className="text-gray-500">风险</dt><dd><SeverityText severity={current.riskLevel} /></dd></div>}
            </dl>
            {current.resultSummary && <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{current.resultSummary}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => navigate(`/runtime?run=${current.id}`)}>打开运行图</Button>
              <Button onClick={() => navigate(`/runtime?run=${current.id}`)}>打开 Trace</Button>
              <Button onClick={() => navigate(`/runtime?run=${current.id}&replay=1`)}>回放</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
