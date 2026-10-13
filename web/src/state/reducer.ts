// 事件流 → 视图状态。纯函数：快进回放就是把同一份事件重新喂一遍（任务说明 2.4）
import {
  AGENTS,
  type AgentId,
  type ChartSpec,
  type CollabStats,
  type Conclusion,
  type Finding,
  type FindingCore,
  type PayloadOf,
  type PeerMessage,
  type RunEvent,
  type RunTrigger,
  type SpecialistId,
  type Stage,
} from '@tbm/shared'

export type AgentStatus = PayloadOf<'agent.status'>['status']

export interface ToolCall {
  callId: string
  tool: string
  label: string
  args: unknown
  startedAt: number
  result?: { isError: boolean; summary: string; evidenceId?: string; chart?: ChartSpec }
}

export interface AgentView {
  status: AgentStatus
  detail?: string
  lastLine: string // 画布节点上显示的最新一行正文（思考内容常为英文，只进抽屉）
  stream: { kind: 'thinking' | 'text'; text: string }[] // 详情抽屉：按段落保留思考 / 正文
  tools: ToolCall[]
  tokens: { input: number; output: number }
}

export type MessageView = PeerMessage & { seq: number; ts: number }

/** 两个 Agent 之间的连线，key 为两者 id 排序后用 | 连接 */
export interface EdgeView {
  key: string
  a: AgentId
  b: AgentId
  count: number
  challenges: number
  last: MessageView
}

export interface Revision {
  before: FindingCore
  after: FindingCore
  reason: string
  cites: string[]
  version: number
  ts: number
}

export interface FindingView extends Finding {
  postedAt: number
  updatedAt: number // 最近一次收到反应或修正，卡片用来闪一下
  revisions: Revision[]
  reactions: MessageView[] // 带 findingId 的 challenge / endorse / defend 等
}

export interface QuestionView extends PayloadOf<'human.asked'> {
  askedAt: number
  answer?: { evidenceId: string; text: string; ts: number } | { timeout: true; ts: number }
}

export interface SessionView extends PayloadOf<'session.opened'> {
  openedAt: number
  closed?: { outcome: string; ts: number }
}

/** 进入解说条和关键时刻条的事件 */
export const FEED_TYPES = [
  'stage.changed', 'peer.message', 'finding.posted', 'finding.revised', 'human.asked', 'human.answered',
  'session.opened', 'conclusion.drafted', 'signoff.submitted', 'review.decided',
] as const
export type FeedEvent = Extract<RunEvent, { type: (typeof FEED_TYPES)[number] }>
const isFeed = (e: RunEvent): e is FeedEvent => (FEED_TYPES as readonly string[]).includes(e.type)

export interface ViewState {
  lastSeq: number
  runId?: string
  title: string
  question: string
  model: string
  trigger?: RunTrigger // 会商由什么发起；缺省为人工发起
  status: 'idle' | 'running' | 'completed' | 'failed' | 'aborted'
  error?: string
  startedAt?: number
  now?: number // 最近一个事件的 ts，用作回放时钟
  finishedAt?: number
  stage?: Stage
  stageTimeout: boolean // 是否有阶段因超时被切换
  snapshot?: PayloadOf<'snapshot.created'>
  agents: Record<AgentId, AgentView>
  messages: MessageView[]
  edges: Record<string, EdgeView>
  findings: Record<string, FindingView>
  findingOrder: string[]
  questions: Record<string, QuestionView>
  questionOrder: string[]
  sessions: SessionView[]
  conclusion?: { version: number; conclusion: Conclusion; ts: number }
  signoffs: (PayloadOf<'signoff.submitted'> & { ts: number })[]
  review?: PayloadOf<'review.decided'> & { ts: number }
  stats: CollabStats
  feed: FeedEvent[]
  refOwners: Record<string, AgentId> // E* / H* / F* 编号属于谁，用来说明"因为谁的证据改口"
}

const AGENT_IDS = Object.keys(AGENTS) as AgentId[]

const emptyAgent = (): AgentView => ({ status: 'idle', lastLine: '', stream: [], tools: [], tokens: { input: 0, output: 0 } })

export const initialState: ViewState = {
  lastSeq: 0,
  title: '',
  question: '',
  model: '',
  status: 'idle',
  stageTimeout: false,
  agents: Object.fromEntries(AGENT_IDS.map((id) => [id, emptyAgent()])) as Record<AgentId, AgentView>,
  messages: [],
  edges: {},
  findings: {},
  findingOrder: [],
  questions: {},
  questionOrder: [],
  sessions: [],
  signoffs: [],
  stats: { peerMessages: 0, asks: 0, humanAsks: 0, challenges: 0, endorses: 0, revisions: 0, crossCitations: 0, signoffs: 0 },
  feed: [],
  refOwners: {},
}

export const edgeKey = (a: AgentId, b: AgentId) => [a, b].sort().join('|')

function lastLineOf(text: string): string {
  const lines = text.split('\n').map((l) => l.replace(/[*#|`>]/g, '').trim()).filter(Boolean)
  return lines.at(-1) ?? ''
}

function patchAgent(s: ViewState, id: AgentId, patch: (a: AgentView) => Partial<AgentView>): ViewState {
  const a = s.agents[id]
  return { ...s, agents: { ...s.agents, [id]: { ...a, ...patch(a) } } }
}

export function reduce(state: ViewState, e: RunEvent): ViewState {
  // 断线重连时服务端可能补发重复事件，只接受更新的 seq
  if (e.seq <= state.lastSeq) return state
  let s: ViewState = { ...state, lastSeq: e.seq, now: e.ts }
  if (isFeed(e)) s.feed = [...s.feed, e]

  switch (e.type) {
    case 'run.started':
      return { ...initialState, lastSeq: e.seq, now: e.ts, runId: e.runId, startedAt: e.ts, status: 'running', ...e.data }

    case 'stage.changed':
      return { ...s, stage: e.data.stage, stageTimeout: s.stageTimeout || e.data.reason === 'timeout' }

    case 'snapshot.created':
      return { ...s, snapshot: e.data }

    case 'agent.status':
      return patchAgent(s, e.data.agentId, () => ({ status: e.data.status, detail: e.data.detail }))

    case 'agent.delta': {
      const { kind, delta } = e.data
      return patchAgent(s, e.data.agentId, (a) => {
        const last = a.stream.at(-1)
        const stream = last?.kind === kind
          ? [...a.stream.slice(0, -1), { kind, text: last.text + delta }]
          : [...a.stream, { kind, text: delta }]
        return { stream, lastLine: kind === 'text' ? lastLineOf(stream.at(-1)!.text) || a.lastLine : a.lastLine }
      })
    }

    case 'tool.started': {
      const { agentId, callId, tool, label, args } = e.data
      return patchAgent(s, agentId, (a) => ({ tools: [...a.tools, { callId, tool, label, args, startedAt: e.ts }] }))
    }

    case 'tool.finished': {
      const { agentId, callId, isError, summary, evidenceId, chart } = e.data
      if (evidenceId) s = { ...s, refOwners: { ...s.refOwners, [evidenceId]: agentId } }
      return patchAgent(s, agentId, (a) => ({
        tools: a.tools.map((t) => (t.callId === callId ? { ...t, result: { isError, summary, evidenceId, chart } } : t)),
      }))
    }

    case 'usage.updated':
      return patchAgent(s, e.data.agentId, () => ({ tokens: { input: e.data.inputTokens, output: e.data.outputTokens } }))

    case 'peer.message': {
      const msg: MessageView = { ...e.data, seq: e.seq, ts: e.ts }
      s = { ...s, messages: [...s.messages, msg] }
      if (msg.to !== 'all') {
        const key = edgeKey(msg.from, msg.to)
        const prev = s.edges[key]
        const [a, b] = key.split('|') as [AgentId, AgentId]
        s = {
          ...s,
          edges: {
            ...s.edges,
            [key]: { key, a, b, count: (prev?.count ?? 0) + 1, challenges: (prev?.challenges ?? 0) + (msg.kind === 'challenge' ? 1 : 0), last: msg },
          },
        }
      }
      const f = msg.findingId ? s.findings[msg.findingId] : undefined
      if (f) s = { ...s, findings: { ...s.findings, [f.id]: { ...f, updatedAt: e.ts, reactions: [...f.reactions, msg] } } }
      return s
    }

    case 'finding.posted': {
      const f = e.data.finding
      return {
        ...s,
        findings: { ...s.findings, [f.id]: { ...f, postedAt: e.ts, updatedAt: e.ts, revisions: [], reactions: [] } },
        findingOrder: [...s.findingOrder, f.id],
        refOwners: { ...s.refOwners, [f.id]: f.agentId },
      }
    }

    case 'finding.revised': {
      const f = s.findings[e.data.findingId]
      if (!f) return s
      const { before, after, reason, cites, version } = e.data
      return {
        ...s,
        findings: { ...s.findings, [f.id]: { ...f, ...after, version, updatedAt: e.ts, revisions: [...f.revisions, { before, after, reason, cites, version, ts: e.ts }] } },
      }
    }

    case 'human.asked':
      return {
        ...s,
        questions: { ...s.questions, [e.data.questionId]: { ...e.data, askedAt: e.ts } },
        questionOrder: [...s.questionOrder, e.data.questionId],
      }

    case 'human.answered': {
      const q = s.questions[e.data.questionId]
      if (!q) return s
      if ('timeout' in e.data) return { ...s, questions: { ...s.questions, [q.questionId]: { ...q, answer: { timeout: true, ts: e.ts } } } }
      const answer = { evidenceId: e.data.evidenceId, text: e.data.text, ts: e.ts }
      return {
        ...s,
        questions: { ...s.questions, [q.questionId]: { ...q, answer } },
        refOwners: { ...s.refOwners, [answer.evidenceId]: 'human' },
      }
    }

    case 'session.opened':
      return { ...s, sessions: [...s.sessions, { ...e.data, openedAt: e.ts }] }

    case 'session.closed':
      return {
        ...s,
        sessions: s.sessions.map((x) => (x.sessionId === e.data.sessionId ? { ...x, closed: { outcome: e.data.outcome, ts: e.ts } } : x)),
      }

    case 'conclusion.drafted':
      // 新版本结论需要重新会签
      return { ...s, conclusion: { ...e.data, ts: e.ts }, signoffs: [] }

    case 'signoff.submitted':
      return { ...s, signoffs: [...s.signoffs, { ...e.data, ts: e.ts }] }

    case 'review.decided':
      return { ...s, review: { ...e.data, ts: e.ts } }

    case 'collab.stats':
      return { ...s, stats: e.data }

    case 'run.finished':
      return { ...s, status: e.data.status, error: e.data.error, finishedAt: e.ts }
  }
}

/** 专业 Agent 当前未回答的现场提问（现场回答卡片用） */
export function pendingQuestions(s: ViewState): QuestionView[] {
  return s.questionOrder.map((id) => s.questions[id]).filter((q) => !q.answer)
}

export function isSpecialist(id: AgentId | 'all'): id is SpecialistId {
  return id !== 'coordinator' && id !== 'human' && id !== 'all'
}
