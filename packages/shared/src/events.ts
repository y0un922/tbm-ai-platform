// 前后端事件契约（设计文档第 4 节）。改动需三方同意。
import type { AgentId, SpecialistId } from './agents.ts'

export type Stage = 'snapshot' | 'solo' | 'review' | 'session' | 'signoff' | 'approval' | 'closed'
export const STAGES: { id: Stage; label: string }[] = [
  { id: 'snapshot', label: '数据快照' },
  { id: 'solo', label: '背靠背研判' },
  { id: 'review', label: '交叉互评' },
  { id: 'session', label: '专项会商' },
  { id: 'signoff', label: '结论会签' },
  { id: 'approval', label: '人工审核' },
]

// ---------- 领域对象 ----------

export interface ChartSpec {
  type: 'line' | 'step' | 'bar'
  x: { key: string; label: string }
  series: { key: string; label: string; unit?: string }[]
  rows: Record<string, number | null>[]
  markers?: { x: number; label: string }[]
}

export interface Evidence {
  id: string // 数据证据 E1…，现场证据 H1…
  owner: AgentId
  kind: 'data' | 'human'
  label: string // 例：泡沫系统 500–540
  summary: string
  rows?: Record<string, string | number | null>[]
  chart?: ChartSpec
}

export type FindingRole = 'primary' | 'secondary' | 'ruled_out' | 'open'

export interface FindingCore {
  claim: string
  brief: string // ≤ 30 字，用于画布和卡片标题
  role: FindingRole
  confidence: number // 0–1
}

export interface Finding extends FindingCore {
  id: string // F1…
  agentId: SpecialistId
  evidence: string[]
  version: number // 每次修正 +1
}

export interface PeerMessage {
  id: string // M1…
  from: AgentId
  to: AgentId | 'all'
  kind: 'ask' | 'answer' | 'challenge' | 'endorse' | 'defend' | 'broadcast'
  brief: string // ≤ 30 字，画布气泡
  text: string // 全文，会商记录
  refs: string[] // 关联的 F* / E* / H*
  findingId?: string // challenge / endorse / defend 针对的判断
  replyTo?: string // answer 对应的 ask
}

export interface Cause {
  cause: string
  findings: string[]
  evidence: string[]
}

export interface Conclusion {
  primary: Cause
  secondary: Cause[]
  ruledOut: Cause[]
  actions: string[]
  dataGaps: string[]
}

export interface CollabStats {
  peerMessages: number // from、to 都是专业 Agent 的消息
  asks: number
  humanAsks: number
  challenges: number
  endorses: number
  revisions: number
  crossCitations: number // 引用了其他 Agent 证据或判断的次数
  signoffs: number
}

/** 会商由什么发起。前端随 POST /api/runs 提交，后端原样写进 run.started */
export interface RunTrigger {
  kind: 'manual' | 'rule' | 'schedule' | 'event' // 人工 / 数据规则 / 定时任务 / 报警联动
  id: string // 触发器编号，人工发起为 'manual'
  name: string // 例：推进速度持续下降
  reason: string // 人工发起时为用户填写的原因；其他为命中条件说明，例：521 环起命中，523 环确认
}

// ---------- 事件 ----------

interface Payloads {
  // 运行与阶段
  'run.started': { scenarioId: string; title: string; question: string; model: string; trigger?: RunTrigger } // trigger 缺省视为人工发起
  'stage.changed': { stage: Stage; reason?: 'normal' | 'timeout' }
  'snapshot.created': { rings: [number, number]; currentRing: number; sources: { owner: SpecialistId; label: string }[]; missing: string[] }
  // 单个 Agent 内部（二级视图）
  'agent.status': { agentId: AgentId; status: 'idle' | 'thinking' | 'tool' | 'waiting' | 'done' | 'error'; detail?: string }
  'agent.delta': { agentId: AgentId; kind: 'thinking' | 'text'; delta: string }
  'tool.started': { agentId: AgentId; callId: string; tool: string; label: string; args: unknown }
  'tool.finished': { agentId: AgentId; callId: string; tool: string; isError: boolean; summary: string; evidenceId?: string; chart?: ChartSpec }
  // Agent 之间（主画面）
  'peer.message': PeerMessage
  'finding.posted': { finding: Finding }
  'finding.revised': { findingId: string; agentId: SpecialistId; before: FindingCore; after: FindingCore; reason: string; cites: string[]; version: number }
  'human.asked': { questionId: string; agentId: SpecialistId; gap: string; question: string; brief: string; options?: string[] }
  'human.answered': { questionId: string; evidenceId: string; text: string } | { questionId: string; timeout: true }
  'session.opened': { sessionId: string; topic: string; participants: SpecialistId[]; findingIds: string[] }
  'session.closed': { sessionId: string; outcome: string }
  'conclusion.drafted': { version: number; conclusion: Conclusion }
  'signoff.submitted': { agentId: SpecialistId; version: number; agree: boolean; note?: string }
  'review.decided': { version: number; decision: 'approve' | 'reject' | 'revise'; comment?: string }
  // 统计与结束
  'collab.stats': CollabStats
  'usage.updated': { agentId: AgentId; inputTokens: number; outputTokens: number } // 该 Agent 累计值
  'run.finished': { status: 'completed' | 'failed' | 'aborted'; error?: string }
}

export type RunEventType = keyof Payloads
export type RunEvent = { [T in RunEventType]: { seq: number; ts: number; runId: string; type: T; data: Payloads[T] } }[RunEventType]
export type EventOf<T extends RunEventType> = Extract<RunEvent, { type: T }>
export type PayloadOf<T extends RunEventType> = Payloads[T]

export const RUN_EVENT_TYPES = [
  'run.started', 'stage.changed', 'snapshot.created',
  'agent.status', 'agent.delta', 'tool.started', 'tool.finished',
  'peer.message', 'finding.posted', 'finding.revised', 'human.asked', 'human.answered',
  'session.opened', 'session.closed', 'conclusion.drafted', 'signoff.submitted', 'review.decided',
  'collab.stats', 'usage.updated', 'run.finished',
] as const satisfies readonly RunEventType[]
// 新增事件类型时，若忘了加进 RUN_EVENT_TYPES，这里会编译报错
const _allTypesListed: Exclude<RunEventType, (typeof RUN_EVENT_TYPES)[number]> extends never ? true : false = true
void _allTypesListed
