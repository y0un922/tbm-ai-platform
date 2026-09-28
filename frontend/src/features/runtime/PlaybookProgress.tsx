import { Badge, Card } from '@/components/ui/primitives'
import type { Run, RuntimeEvent } from '@/types'

export function PlaybookProgress({ run, events, compact }: { run: Run; events: RuntimeEvent[]; compact?: boolean }) {
  if (!run.playbook) return null
  const completed = new Set(events.filter((event) => event.type === 'stage.completed').map((event) => event.data.stageId))
  const current = events.filter((event) => event.type === 'stage.started').at(-1)?.data.stageId
  const reviewStage = events.filter((event) => event.type === 'human_review.requested' && event.data.reviewId === run.humanReview?.id).at(-1)?.data.stageId
  const pills = run.playbook.stages.map((stage, index) => {
    const done = completed.has(stage.id)
    const active = !done && stage.id === current
    const reviewing = active && reviewStage === stage.id && (run.humanReview?.status === 'pending' || run.humanReview?.status === 'needs_data')
    const label = done ? '完成' : active ? run.status === 'failed' ? '已中止' : reviewing ? run.humanReview?.status === 'needs_data' ? '待补数' : '待审核' : '进行中' : run.status === 'failed' ? '未执行' : '等待'
    const tone: 'good' | 'bad' | 'warn' | 'info' | 'neutral' = done ? 'good' : active ? run.status === 'failed' ? 'bad' : reviewing ? 'warn' : 'info' : 'neutral'
    return { stage, index, active, label, tone }
  })
  if (compact) {
    return (
      <ol className="flex flex-wrap items-center gap-1.5">
        {pills.map((item) => (
          <li key={item.stage.id} className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${item.active ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-gray-200 bg-white text-gray-600'}`}>
            <span className="tabular-nums text-gray-400">{item.index + 1}</span>
            <span className="font-medium">{item.stage.name}</span>
            <Badge tone={item.tone}>{item.label}</Badge>
          </li>
        ))}
      </ol>
    )
  }
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{run.playbook.name}</h2><Badge tone="info">运行快照 · v{run.playbook.version}</Badge></div>
        <span className="text-xs text-gray-500">业务阶段 {completed.size} / {run.playbook.stages.length} 完成</span>
      </div>
      <ol className="grid gap-2 p-3 md:grid-cols-2 2xl:grid-cols-3">
        {pills.map((item) => (
          <li key={item.stage.id} className={`min-w-0 rounded-lg border p-3 ${item.active ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100 bg-gray-50/60'}`}>
            <div className="flex items-center gap-2 text-sm"><span className="text-xs tabular-nums text-gray-400">{String(item.index + 1).padStart(2, '0')}</span><b className="min-w-0 flex-1 truncate">{item.stage.name}</b><Badge tone={item.tone}>{item.label}</Badge></div>
          </li>
        ))}
      </ol>
    </Card>
  )
}
