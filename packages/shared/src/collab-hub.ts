// CollabHub 接口（设计文档 2.4、7 节）。
// B 实现：存储、编号、投递、事件发出、统计，不涉及模型。
// C 使用：在协作工具里调用；订阅 onDeliver 决定何时、以什么内容注入给 Agent。
import type { AgentId, SpecialistId } from './agents.ts'
import type { CollabStats, Conclusion, Evidence, Finding, FindingCore, PeerMessage, Stage } from './events.ts'

export interface HumanQuestion {
  agentId: SpecialistId
  gap: string // 必须是快照缺失项或该 Agent 判断里的 missing 之一
  question: string
  brief: string
  options?: string[]
}

export type HumanAnswer = { evidence: Evidence; text: string } | { timeout: true }

export interface CollabHub {
  readonly runId: string
  readonly stage: Stage
  setStage(stage: Stage, reason?: 'normal' | 'timeout'): void

  // 证据：数据证据编号 E*，现场证据编号 H*
  addEvidence(e: Omit<Evidence, 'id'>): Evidence
  evidence(id: string): Evidence | undefined
  /** 返回不存在的编号；空数组表示全部有效。判断（F）、数据证据（E）、现场证据（H）编号均可校验 */
  missingRefs(refs: string[]): string[]
  /** 编号所属的 Agent，用于判断是否为跨专业引用 */
  ownerOf(ref: string): AgentId | undefined

  // 协作板
  postFinding(agentId: SpecialistId, core: FindingCore, evidence: string[]): Finding
  reviseFinding(findingId: string, after: FindingCore, reason: string, cites: string[]): Finding
  finding(id: string): Finding | undefined
  findings(): Finding[]

  // 消息：发出 peer.message 事件，更新统计，并按收件人投递
  send(msg: Omit<PeerMessage, 'id'>): PeerMessage
  /** 收件人收到消息时回调（to 为 'all' 时，除发送者外每人一次）。C 在这里决定 steer 还是放入待办 */
  onDeliver(handler: (to: AgentId, msg: PeerMessage) => void): () => void
  /** 给当前空闲的 Agent 暂存的消息，下一阶段开始时取出 */
  defer(to: AgentId, msg: PeerMessage): void
  takeDeferred(to: AgentId): PeerMessage[]

  // 问现场：挂起直到 answerHuman 或超时
  askHuman(q: HumanQuestion, timeoutMs: number): Promise<HumanAnswer>
  /** 由 POST /api/runs/:id/answer 调用 */
  answerHuman(questionId: string, text: string): void

  // 会商与结论
  openSession(topic: string, participants: SpecialistId[], findingIds: string[]): string
  closeSession(sessionId: string, outcome: string): void
  draftConclusion(conclusion: Conclusion): number // 返回版本号
  signOff(agentId: SpecialistId, version: number, agree: boolean, note?: string): void

  stats(): CollabStats
}
