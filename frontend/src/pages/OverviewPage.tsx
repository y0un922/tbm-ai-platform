import { useQuery } from '@tanstack/react-query'
import { getDashboard } from '@/api/projects'
import { listAgents } from '@/api/agents'
import { listRuns } from '@/api/runs'
import { listTriggerInstances } from '@/api/triggers'
import { AppLink } from '@/app/router'
import { Card, CardHeader, EmptyState, ErrorState, Kpi, PageHeader, RunStatusText, Skeleton } from '@/components/ui/primitives'
import { EngineeringMetrics, ProgressCard, RiskList, SummaryCard, TrendCard } from '@/features/dashboard/widgets'
import { useProjectId } from '@/hooks/useProject'
import { TRIGGER_TYPE_LABEL } from '@/features/runtime/labels'
import { formatRelative, formatTime } from '@/utils/format'

export function OverviewPage() {
  const { projectId } = useProjectId()
  const dash = useQuery({ queryKey: ['dashboard', projectId], queryFn: () => getDashboard(projectId) })
  const runs = useQuery({ queryKey: ['runs', projectId], queryFn: () => listRuns(projectId), refetchInterval: 4000 })
  const triggers = useQuery({ queryKey: ['trigger-instances', projectId], queryFn: () => listTriggerInstances(projectId) })
  const agents = useQuery({ queryKey: ['agents'], queryFn: listAgents })
  if (dash.isPending) return <div className="grid gap-3 md:grid-cols-5">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-24" />)}</div>
  if (dash.isError) return <ErrorState body={dash.error.message} onRetry={() => dash.refetch()} />
  const data = dash.data
  const active = (runs.data ?? []).filter((run) => run.status === 'running' || run.status === 'review')
  const reviews = (runs.data ?? []).filter((run) => run.humanReview?.status === 'pending')
  return (
    <div className="space-y-4">
      <PageHeader title="总览" sub={`${data.project.name} / ${data.project.line} · ${data.project.stage}`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.metrics.map((metric) => <Kpi key={metric.id} {...metric} />)}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><TrendCard series={data.trend} /></div>
        <ProgressCard progress={data.progress} />
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <RiskList risks={data.risks} />
        <SummaryCard summary={data.summary} />
        <EngineeringMetrics rows={data.engineeringMetrics} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="最近触发" extra={<AppLink to="/triggers" className="text-xs text-indigo-600">Trigger 中心</AppLink>} />
          <div className="divide-y divide-gray-100">
            {(triggers.data ?? []).length === 0 && <EmptyState title="没有触发" body="Trigger 由后端引擎产生，前端只展示实例。" />}
            {(triggers.data ?? []).slice(0, 5).map((item) => (
              <div key={item.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <b className="font-medium">{item.name}</b>
                  <span className="text-xs text-gray-400">{formatRelative(item.timestamp)}</span>
                </div>
                <p className="text-xs text-gray-500">{TRIGGER_TYPE_LABEL[item.type]} · {item.source}</p>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="活跃运行" extra={<AppLink to="/runtime" className="text-xs text-indigo-600">运行视图</AppLink>} />
          <div className="divide-y divide-gray-100">
            {active.length === 0 && <EmptyState title="没有进行中的运行" body="用户目标或后端触发后，运行会出现在这里。" />}
            {active.map((run) => (
              <AppLink key={run.id} to={`/runtime?run=${run.id}`} className="block px-4 py-2.5 hover:bg-gray-50">
                <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{run.goal}</span><RunStatusText status={run.status} /></div>
                <p className="text-xs text-gray-500">{run.trigger.name} · {formatTime(run.startedAt)}</p>
              </AppLink>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Agent 与审核" />
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap gap-1.5">
              {(agents.data ?? []).map((agent) => (
                <AppLink key={agent.id} to={`/agents?agent=${agent.id}`} className="rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-700">{agent.name} · {agent.status === 'online' ? '在线' : agent.status === 'standby' ? '待机' : '离线'}</AppLink>
              ))}
            </div>
            {reviews.length === 0 ? <p className="text-sm text-gray-500">没有待审核项。</p> : reviews.map((run) => (
              <AppLink key={run.id} to={`/collaboration?run=${run.id}`} className="block rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900">需要人工审核 · {run.goal}</AppLink>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
