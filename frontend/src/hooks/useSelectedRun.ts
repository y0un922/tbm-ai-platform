import { useQuery } from '@tanstack/react-query'
import { listRuns } from '@/api/runs'
import { useRoute } from '@/app/router'
import { useProjectId } from '@/hooks/useProject'
import type { ReviewDecision, Run } from '@/types'

export function useSelectedRun() {
  const { params, navigate, path } = useRoute()
  const { projectId } = useProjectId()
  const query = useQuery({ queryKey: ['runs', projectId], queryFn: () => listRuns(projectId), refetchInterval: 3000 })
  const runs = query.data ?? []
  const requested = params.get('run')
  const run = runs.find((item) => item.id === requested) ?? runs.find((item) => item.status === 'running' || item.status === 'review') ?? runs[0]
  return {
    ...query,
    runs,
    run,
    select: (id: string) => navigate(`${path}?run=${id}`),
  }
}

export function reviewDecisions(run?: Run): Record<string, ReviewDecision> {
  if (!run?.humanReview || run.humanReview.status === 'pending') return {}
  const map = { approved: 'approve', rejected: 'reject', needs_data: 'request_more_data' } as const
  return { [run.humanReview.id]: map[run.humanReview.status] }
}
