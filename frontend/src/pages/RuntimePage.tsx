import { useQuery } from '@tanstack/react-query'
import { getRun } from '@/api/runs'
import { HumanReviewPanel } from '@/features/runtime/HumanReviewPanel'
import { PlaybookProgress } from '@/features/runtime/PlaybookProgress'
import { TranscriptView } from '@/features/runtime/TranscriptView'
import { Card, ErrorState, PageHeader, RunStatusText } from '@/components/ui/primitives'
import { useRuntimeEvents } from '@/features/runtime/useRuntimeEvents'
import { useSelectedRun } from '@/hooks/useSelectedRun'
import { formatDuration } from '@/utils/format'

export function RuntimePage() {
  const selected = useSelectedRun()
  const runQuery = useQuery({ queryKey: ['run', selected.run?.id], queryFn: () => getRun(selected.run!.id), enabled: Boolean(selected.run?.id), refetchInterval: 3000 })
  const run = runQuery.data ?? selected.run
  const stream = useRuntimeEvents(run?.id)
  const review = run?.humanReview
  const needsAction = review?.status === 'pending' || review?.status === 'needs_data'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <PageHeader
        title="运行视图"
        sub="Coordinator 主线 · 点 Agent 卡看它自己的思考和工具。"
        extra={
          <>
            <label className="text-sm text-gray-500">
              <span className="sr-only">选择运行</span>
              <select className="rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm" value={run?.id ?? ''} onChange={(e) => selected.select(e.target.value)} aria-label="选择运行">
                {selected.runs.map((item) => <option key={item.id} value={item.id}>{item.goal}</option>)}
              </select>
            </label>
            {run && <RunStatusText status={run.status} />}
            {run && <span className="text-xs text-gray-500 tabular-nums">{formatDuration(run.durationMs)}</span>}
          </>
        }
      />
      {selected.isError && <ErrorState body={selected.error.message} onRetry={() => selected.refetch()} />}
      {runQuery.isError && <ErrorState title="运行详情加载失败" body={runQuery.error.message} onRetry={() => runQuery.refetch()} />}
      {stream.error && <ErrorState title="事件流中断" body={`${stream.error}。当前保留最后收到的记录。`} />}
      {!run && <Card><p className="p-6 text-sm text-gray-500">当前项目没有运行。可从 AI 协同提交目标，或等待后端 Trigger。</p></Card>}
      {run && (
        <>
          <PlaybookProgress run={run} events={stream.events} />
          {needsAction && <HumanReviewPanel key={`${run.id}:${review?.id}`} run={run} />}
          <Card className="flex min-h-[560px] flex-1 flex-col overflow-hidden">
            <TranscriptView key={run.id} events={stream.events} />
          </Card>
        </>
      )}
    </div>
  )
}
