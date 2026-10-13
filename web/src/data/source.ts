// 组件只通过 RunSource 取数据，不直接碰 EventSource / fetch（任务说明 2.3）
import type { CreateRunRequest, Evidence, HealthResponse, RingPoint, RunEvent } from '@tbm/shared'

export interface RunSource {
  readonly kind: 'local' | 'http'
  createRun(req: CreateRunRequest): Promise<string> // 返回 runId
  /** after：只要 seq 比它大的事件（断线续传）。返回取消订阅函数 */
  subscribe(runId: string, onEvent: (e: RunEvent) => void, after?: number): () => void
  evidence(runId: string, id: string): Promise<Evidence>
  rings(from: number, to: number): Promise<RingPoint[]>
  answer(runId: string, questionId: string, text: string): Promise<void>
  review(runId: string, version: number, decision: 'approve' | 'reject', comment?: string): Promise<void>
  abort(runId: string): Promise<void>
  health(): Promise<HealthResponse> // 开始页预检
}
