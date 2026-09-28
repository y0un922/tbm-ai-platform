import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play } from 'lucide-react'
import { isMockMode, request } from '@/api/client'
import { createRun } from '@/api/runs'
import { HumanReviewPanel } from '@/features/runtime/HumanReviewPanel'
import { PlaybookProgress } from '@/features/runtime/PlaybookProgress'
import { useRoute } from '@/app/router'
import { Markdown } from '@/components/ui/Markdown'
import { Badge, Button, Card, ErrorState, inputClass } from '@/components/ui/primitives'
import { toast } from '@/components/ui/primitives'
import { RuntimeCanvas } from '@/features/runtime/RuntimeCanvas'
import { RuntimeDetail } from '@/features/runtime/RuntimeDetail'
import { useRunGraph } from '@/features/runtime/useRuntimeEvents'
import { reviewDecisions, useSelectedRun } from '@/hooks/useSelectedRun'
import { useProjectId } from '@/hooks/useProject'
import type { Run, RuntimeEvent } from '@/types'
import { str } from '@/utils/format'

const EXAMPLES = ['分析 1250 环附近掘进效率下降原因', '评估掌子面前方地质风险', '解释泡沫压力波动对渣土的影响', '生成当班关注事项']

function RunOutcome({ run, events }: { run: Run; events: RuntimeEvent[] }) {
  if (run.status !== 'completed' && run.status !== 'review' && run.status !== 'failed') return null
  const text = run.status === 'failed' ? (run.resultSummary || '运行失败') : (run.humanReview?.result || run.resultSummary || '')
  if (!text) return null
  const review = run.humanReview
  const delegated = events.filter((event) => event.type === 'agent.delegated' && str(event.data, 'agentId') !== 'coordinator')
  const decisions = delegated.some((event) => str(event.data, 'task'))
    ? delegated.map((event) => ({ id: event.id, name: str(event.data, 'name', str(event.data, 'agentId')), task: str(event.data, 'task') }))
    : events.filter((event) => event.type === 'tool.called' && str(event.data, 'toolId') === 'delegate').map((event) => {
      const input = event.data.input as { agentId?: string; task?: string } | undefined
      return { id: event.id, name: input?.agentId ?? 'agent', task: input?.task ?? '' }
    })
  return (
    <section className="grid shrink-0 gap-4 rounded-xl border border-gray-200 bg-white p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-gray-900">{run.status === 'failed' ? '运行失败' : run.status === 'review' ? '待审结论' : '结论'}</h2>
        <div className="mt-2 max-h-[40vh] overflow-auto text-sm"><Markdown className="text-sm" text={text} /></div>
        {review?.recommendation && <div className="mt-3 text-sm text-gray-700"><span className="font-medium">建议 </span><Markdown className="inline text-sm" text={review.recommendation} /></div>}
        {review?.risk && <div className="mt-1 text-sm text-amber-800"><span className="font-medium">风险 </span><Markdown className="inline text-sm text-amber-800" text={review.risk} /></div>}
      </div>
      <div className="min-w-0 border-t border-gray-100 pt-3 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-4">
        <h2 className="text-sm font-semibold text-gray-900">Coordinator 调度</h2>
        {decisions.length === 0 ? <p className="mt-2 text-sm text-gray-500">还没有委派记录。</p> : (
          <ol className="mt-2 space-y-2">
            {decisions.map((item, index) => (
              <li key={item.id} className="text-sm leading-relaxed">
                <span className="mr-2 tabular-nums text-gray-400">{index + 1}</span>
                <span className="font-medium text-gray-900">{item.name}</span>
                <span className="mt-0.5 block truncate pl-5 text-gray-600" title={item.task}>{item.task || '未写明任务'}</span>
              </li>
            ))}
          </ol>
        )}

      </div>
    </section>
  )
}

export function CollaborationPage() {
  const { projectId } = useProjectId()
  const { navigate } = useRoute()
  const qc = useQueryClient()
  const selected = useSelectedRun()
  const [goal, setGoal] = useState(EXAMPLES[0])
  const [picked, setPicked] = useState<string>()
  const graph = useRunGraph(selected.run?.id, reviewDecisions(selected.run))
  const node = graph.model.nodes.find((item) => item.id === picked)
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => request<{ ok: boolean; model?: { provider: string; id: string } | null }>('/health'),
    enabled: !isMockMode,
    staleTime: 60_000,
  })
  const model = health.data?.model
  useEffect(() => { setPicked(undefined) }, [selected.run?.id])

  const start = useMutation({
    mutationFn: (text: string) => createRun({ projectId, goal: text }),
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['runs'] })
      navigate(`/collaboration?run=${run.id}`)
      toast('已创建用户目标触发，Coordinator 开始自主调度')
    },
    onError: (error: Error) => toast(error.message),
  })

  return (
    <div className="flex h-[calc(100vh-6.5rem)] min-h-[36rem] flex-col gap-3">
      {isMockMode && (
        <p className="shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          当前是前端 Mock，画布是写死剧本。要接模型：<code className="rounded bg-white px-1">backend npm run dev</code> + <code className="rounded bg-white px-1">frontend npm run dev:live</code>
        </p>
      )}
      <Card className="shrink-0">
        <form className="flex flex-col gap-3 p-4 lg:flex-row lg:items-end" onSubmit={(e) => { e.preventDefault(); if (goal.trim()) start.mutate(goal.trim()) }}>
          <label className="min-w-0 flex-1">
            <span className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500">
              任务目标
              {model && <Badge tone="info">{model.provider}/{model.id}</Badge>}
            </span>
            <input className={inputClass} maxLength={500} value={goal} onChange={(e) => setGoal(e.target.value)} aria-label="任务目标" />
          </label>
          <Button variant="primary" type="submit" disabled={start.isPending || !goal.trim()}>
            <Play className="size-4" aria-hidden />
            {start.isPending ? '正在创建' : '开始分析'}
          </Button>
        </form>
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50" onClick={() => setGoal(example)}>{example}</button>
          ))}
        </div>
      </Card>
      {selected.isError && <ErrorState body={selected.error.message} onRetry={() => selected.refetch()} />}
      {graph.error && <ErrorState title="事件流中断" body={graph.error} />}
      {selected.run && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 px-1">
          <PlaybookProgress run={selected.run} events={graph.allEvents} compact />
        </div>
      )}
      {selected.run && <div className="shrink-0"><HumanReviewPanel key={`${selected.run.id}:${selected.run.humanReview?.id}`} run={selected.run} /></div>}
      {selected.run && <RunOutcome run={selected.run} events={graph.allEvents} />}
      <div className="relative min-h-0 flex-1">
        <Card className="h-full min-h-0 overflow-hidden">
          <RuntimeCanvas
            key={selected.run?.id ?? 'empty'}
            nodes={graph.model.nodes}
            edges={graph.model.edges}
            selectedId={node?.id}
            onSelect={setPicked}
            mode={graph.mode}
            onMode={graph.setMode}
            onReplay={graph.replay}
            replaying={graph.replaying}
            onLive={graph.followLive}
            speed={graph.speed}
            onSpeed={graph.setSpeed}
            liveMessage={graph.liveMessage}
          />
        </Card>
        {node && (
          <aside className="inspector-glass absolute inset-y-3 right-3 z-20 flex w-[min(400px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-[20px] bg-white/80 shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-2xl">
            <RuntimeDetail node={node} events={graph.events} runId={selected.run?.id} goal={selected.run?.goal} onClose={() => setPicked(undefined)} />
          </aside>
        )}
      </div>
    </div>
  )
}
