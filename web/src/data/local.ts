// 不需要后端：按样本里的时间戳间隔播放 web/dev 下的录制文件
import type { CreateRunRequest, Evidence, HealthResponse, RingPoint, RunEvent, RunTrigger } from '@tbm/shared'
import type { RunSource } from './source.ts'
import sampleRun from '../../dev/sample-run.jsonl?raw'
import sampleEvidence from '../../dev/sample-evidence.json'
import sampleRings from '../../dev/sample-rings.json'

const TICK_MS = 50

export function parseJsonl(text: string): RunEvent[] {
  return text.trim().split('\n').map((line) => JSON.parse(line) as RunEvent)
}

export class LocalReplaySource implements RunSource {
  readonly kind = 'local'
  private events = parseJsonl(sampleRun)
  private speed = 1
  private trigger?: RunTrigger

  // 与后端 replay 一致：question 沿用样本，trigger 写进 run.started
  async createRun(req: CreateRunRequest): Promise<string> {
    this.speed = req.speed ?? 1
    this.trigger = req.trigger
    return this.events[0].runId
  }

  subscribe(_runId: string, onEvent: (e: RunEvent) => void, after = 0): () => void {
    const events = this.events
      .filter((e) => e.seq > after)
      .map((e) => (e.type === 'run.started' && this.trigger ? { ...e, data: { ...e.data, trigger: this.trigger } } : e))
    if (events.length === 0) return () => {}
    const t0 = events[0].ts
    const start = performance.now()
    let i = 0
    const timer = setInterval(() => {
      const elapsed = (performance.now() - start) * this.speed
      while (i < events.length && events[i].ts - t0 <= elapsed) onEvent(events[i++])
      if (i >= events.length) clearInterval(timer)
    }, TICK_MS)
    return () => clearInterval(timer)
  }

  async evidence(_runId: string, id: string): Promise<Evidence> {
    const e = (sampleEvidence as Record<string, Evidence>)[id]
    if (!e) throw new Error(`证据 ${id} 不存在`)
    return e
  }

  async rings(from: number, to: number): Promise<RingPoint[]> {
    return (sampleRings as RingPoint[]).filter((r) => r.ring >= from && r.ring <= to)
  }

  async answer(runId: string, questionId: string, text: string) {
    console.info('[local] answer', { runId, questionId, text })
  }

  async review(runId: string, version: number, decision: 'approve' | 'reject', comment?: string) {
    console.info('[local] review', { runId, version, decision, comment })
  }

  async abort(runId: string) {
    console.info('[local] abort', { runId })
  }

  async health(): Promise<HealthResponse> {
    return { ok: true, model: 'local-replay' }
  }
}
