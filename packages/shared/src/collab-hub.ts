// CollabHub 接口（设计文档 2.4、7 节）。
// B 实现：存储、编号、投递、事件发出、统计，不涉及模型。
// C 使用：在协作工具里调用；订阅 onDeliver 决定何时、以什么内容注入给 Agent。
// 每个方法后面注明它负责发出的事件。C 不直接发这些事件，避免重复。
import type { AgentId, SpecialistId } from './agents.ts'
import type { CollabStats, Conclusion, Evidence, Finding, FindingCore, PeerMessage, Stage } from './events.ts'

export interface HumanQuestion {
  agentId: SpecialistId
  gap: string // C 负责校验：必须是快照缺失项之一
  question: string
  brief: string
  options?: string[]
}

export type HumanAnswer = { evidence: Evidence; text: string } | { timeout: true }

export interface CollabHub {
  readonly runId: string
  readonly stage: Stage
  /** 发出 stage.changed */
  setStage(stage: Stage, reason?: 'normal' | 'timeout'): void

  // 证据：数据证据编号 E1、E2…，现场证据编号 H1、H2…（不发事件；tool.finished 由 C 的事件桥接发出并带上 evidenceId）
  addEvidence(e: Omit<Evidence, 'id'>): Evidence
  evidence(id: string): Evidence | undefined
  /** 返回不存在的编号；空数组表示全部有效。判断（F）、数据证据（E）、现场证据（H）编号均可校验 */
  missingRefs(refs: string[]): string[]
  /** 编号所属的 Agent，用于判断是否为跨专业引用 */
  ownerOf(ref: string): AgentId | undefined

  // 协作板
  /** 发出 finding.posted、collab.stats */
  postFinding(agentId: SpecialistId, core: FindingCore, evidence: string[]): Finding
  /** 发出 finding.revised、collab.stats（revisions、crossCitations） */
  reviseFinding(findingId: string, after: FindingCore, reason: string, cites: string[]): Finding
  finding(id: string): Finding | undefined
  findings(): Finding[]

  // 消息
  /** 发出 peer.message、collab.stats（按 kind 累加 asks/challenges/endorses，并统计 peerMessages、crossCitations），然后按收件人回调 onDeliver */
  send(msg: Omit<PeerMessage, 'id'>): PeerMessage
  /** 全部已发消息，按发送顺序。C 用它拼协作板摘要 */
  messages(): PeerMessage[]
  /** 收件人收到消息时回调（to 为 'all' 时，除发送者外每位专业 Agent 各一次）。C 在这里决定 steer 还是 defer */
  onDeliver(handler: (to: AgentId, msg: PeerMessage) => void): () => void
  /** 给当前空闲的 Agent 暂存消息，下一阶段开始时由 C 取出放进提示词 */
  defer(to: AgentId, msg: PeerMessage): void
  takeDeferred(to: AgentId): PeerMessage[]

  // 问现场
  /** 发出 human.asked、collab.stats（humanAsks）；挂起直到 answerHuman 或超时，然后登记 H 证据并发出 human.answered */
  askHuman(q: HumanQuestion, timeoutMs: number): Promise<HumanAnswer>
  /** 由 POST /api/runs/:id/answer 调用；问题不存在或已结束时抛错 */
  answerHuman(questionId: string, text: string): void

  // 会商与结论
  /** 发出 session.opened，返回 S1、S2… */
  openSession(topic: string, participants: SpecialistId[], findingIds: string[]): string
  /** 发出 session.closed */
  closeSession(sessionId: string, outcome: string): void
  /** 发出 conclusion.drafted，返回版本号（从 1 开始） */
  draftConclusion(conclusion: Conclusion): number
  /** 发出 signoff.submitted、collab.stats（signoffs） */
  signOff(agentId: SpecialistId, version: number, agree: boolean, note?: string): void

  stats(): CollabStats
}
