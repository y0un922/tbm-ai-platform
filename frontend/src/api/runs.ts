import type { ReviewDecision, Run, RuntimeEvent } from '@/types'
import { request, subscribe } from '@/api/client'

export const listRuns = (projectId: string) => request<Run[]>(`/runs?projectId=${projectId}`)
export const getRun = (id: string) => request<Run>(`/runs/${id}`)
export const createRun = (body: { projectId: string; goal: string; demo?: 'fir' }) => request<Run>('/runs', { method: 'POST', body })
export const decideReview = (id: string, decision: ReviewDecision, reviewId?: string) => request<Run>(`/runs/${id}/review`, { method: 'POST', body: { decision, reviewId } })
/** Proposed contract: backend validates the material and returns the authoritative review state. */
export const submitSupplement = (id: string, reviewId: string, content: string) => request<Run>(`/runs/${id}/supplement`, { method: 'POST', body: { reviewId, content } })
export const subscribeRunEvents = (id: string, onEvent: (event: RuntimeEvent) => void, onError?: (error: Error) => void) =>
  subscribe(`/runs/${id}/events`, onEvent, onError)
