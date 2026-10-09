// 前后端 REST / SSE 契约。前端只通过这里定义的接口和 events.ts 中的事件与后端交互。
import type { Evidence } from './events.ts'
import type { Stage } from './events.ts'

export const API_PORT = 8787 // 后端监听 127.0.0.1:8787，前端开发服务器把 /api 代理过去
export const API_BASE = '/api'

/** 所有非 2xx 响应的 body */
export interface ApiError {
  error: string
}

// POST /api/runs → 201
// mode=live 真实调用模型；mode=replay 由后端按原始时间间隔回放 web/dev/sample-run.jsonl（不调模型，用于前后端联调和兜底排查）
// 已有运行中的 run 时返回 409
export interface CreateRunRequest {
  mode?: 'live' | 'replay' // 默认 live
  speed?: number // 仅 replay：回放倍速，默认 1
}
export interface CreateRunResponse {
  runId: string
}

// GET /api/runs/:id → 200 | 404
export interface RunSummary {
  runId: string
  mode: 'live' | 'replay'
  status: 'running' | 'awaiting_review' | 'completed' | 'failed' | 'aborted'
  stage: Stage
  lastSeq: number
  startedAt: number
}

// GET /api/runs/:id/events → text/event-stream
// 每条事件一帧：`id: <seq>\ndata: <RunEvent JSON>\n\n`，不使用 event: 字段（前端统一用 onmessage）
// 断线重连：浏览器自动带 Last-Event-ID，也可用查询参数 ?after=<seq>；服务端先补发 seq 更大的历史事件，再推实时事件
// 每 15 秒发一行注释 `: ping` 保活；发出 run.finished 后服务端关闭连接
export const SSE_PING_MS = 15_000

// GET /api/runs/:id/evidence/:eid → 200 Evidence | 404
export type EvidenceResponse = Evidence

// POST /api/runs/:id/answer → 204
// 404：问题不存在；409：问题已回答或已超时
export interface AnswerRequest {
  questionId: string
  text: string
}

// POST /api/runs/:id/review → 204
// 409：当前不在 approval 阶段，或 version 不是最新结论版本
// Demo 中 approve 和 reject 都会结束运行；revise 暂不支持（返回 400）
export interface ReviewRequest {
  version: number
  decision: 'approve' | 'reject'
  comment?: string
}

// GET /api/data/rings?from=500&to=540 → 200 RingPoint[]（左栏参数曲线，整体数据，不区分数据域）
export interface RingPoint {
  ring: number
  advanceSpeed: number
  torque: number
  thrust: number
  fir: number // 0–1
  gravelContent: number // 0–1
}

// GET /api/health → 200 | 503
export interface HealthResponse {
  ok: boolean
  model: string
  firstTokenMs?: number
  error?: string
}
