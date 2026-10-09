// 后端（B）与 Agent 编排（C）之间的接口。两边都在 server 包内，按这里的签名对接。
//
// 事件由谁发出：
//   B（RunManager）：run.started、snapshot.created、stage.changed（approval / closed）、review.decided、run.finished
//   B（CollabHub）  ：见 @tbm/shared collab-hub.ts 各方法注释
//   C（事件桥接）   ：agent.status、agent.delta、tool.started、tool.finished、usage.updated，通过 ctx.emit 发出
// agent.delta 由 C 逐条 emit，B 的 EventBus 负责每 50 ms 合并后再推送。
import type { CollabHub, PayloadOf } from '@tbm/shared'
import type { RingRow } from './data/scenario.ts'

export type AgentEventType = 'agent.status' | 'agent.delta' | 'tool.started' | 'tool.finished' | 'usage.updated'
export type EmitAgentEvent = <T extends AgentEventType>(type: T, data: PayloadOf<T>) => void

export interface ScenarioData {
  ringRange(from: number, to: number): RingRow[]
  rings: [number, number] // 快照环号范围
  currentRing: number
  question: string // 发给 Agent 的事件描述
  missing: string[] // 快照缺失项；ask_human 的 gap 必须从这里选
}

export interface OrchestrationContext {
  runId: string
  hub: CollabHub
  emit: EmitAgentEvent
  data: ScenarioData
  signal: AbortSignal // 运行被中止时触发，C 需要对所有 Agent 调用 abort()
}

/**
 * C 实现，B 调用。B 在调用前已发出 run.started、snapshot.created。
 * C 负责 solo → review → session → signoff 四个阶段（通过 hub.setStage 切换），结论会签完成后 resolve。
 * 之后由 B 切到 approval 阶段并等待人工审核。抛错即视为运行失败，B 发出 run.finished(failed)。
 */
export type RunOrchestration = (ctx: OrchestrationContext) => Promise<void>
