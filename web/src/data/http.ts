// 联调与演示：按 @tbm/shared api.ts 调后端
import { API_BASE, type AnswerRequest, type ApiError, type CreateRunRequest, type CreateRunResponse, type Evidence, type HealthResponse, type ReviewRequest, type RingPoint, type RunEvent } from '@tbm/shared'
import type { RunSource } from './source.ts'

async function call<T>(path: string, init?: { method: 'POST'; body?: unknown }): Promise<T> {
  const res = await fetch(API_BASE + path, init && {
    method: init.method,
    headers: { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null
    throw new Error(`${res.status} ${body?.error ?? res.statusText}`)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

export class HttpSource implements RunSource {
  readonly kind = 'http'

  async createRun(req: CreateRunRequest): Promise<string> {
    return (await call<CreateRunResponse>('/runs', { method: 'POST', body: req })).runId
  }

  subscribe(runId: string, onEvent: (e: RunEvent) => void, after?: number): () => void {
    // 断线后浏览器自动带 Last-Event-ID 重连；?after 只用于首次连接（如页面刷新后续传）
    const qs = after ? `?after=${after}` : ''
    const es = new EventSource(`${API_BASE}/runs/${runId}/events${qs}`)
    es.onmessage = (msg) => {
      const e = JSON.parse(msg.data) as RunEvent
      onEvent(e)
      if (e.type === 'run.finished') es.close() // 否则浏览器会一直重连
    }
    return () => es.close()
  }

  evidence(runId: string, id: string) {
    return call<Evidence>(`/runs/${runId}/evidence/${id}`)
  }

  rings(from: number, to: number) {
    return call<RingPoint[]>(`/data/rings?from=${from}&to=${to}`)
  }

  answer(runId: string, questionId: string, text: string) {
    return call<void>(`/runs/${runId}/answer`, { method: 'POST', body: { questionId, text } satisfies AnswerRequest })
  }

  review(runId: string, version: number, decision: 'approve' | 'reject', comment?: string) {
    return call<void>(`/runs/${runId}/review`, { method: 'POST', body: { version, decision, comment } satisfies ReviewRequest })
  }

  abort(runId: string) {
    return call<void>(`/runs/${runId}/abort`, { method: 'POST' })
  }

  // 503 时 body 仍是 HealthResponse（ok: false），这里不当作异常
  async health(): Promise<HealthResponse> {
    const res = await fetch(`${API_BASE}/health`)
    return (await res.json()) as HealthResponse
  }
}
