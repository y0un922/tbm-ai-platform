// 协作验证 + 事件录制：完整跑一次会商，输出符合 @tbm/shared 事件协议的 JSONL
// 用法：npm run spike:debate [-- --out ../web/dev/sample-run.jsonl]
// 流程：数据快照 → 背靠背研判 → 交叉互评 → 专项会商（协调主持）→ 起草结论 → 会签 → 人工审核（模拟）
import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from '@earendil-works/pi-agent-core'
import {
  AGENTS, SPECIALISTS, type RunTrigger,
  type AgentId, type ChartSpec, type CollabStats, type Conclusion, type Evidence, type Finding, type FindingCore,
  type PayloadOf, type PeerMessage, type RingPoint, type RunEvent, type RunEventType, type SpecialistId, type Stage,
} from '@tbm/shared'
import { appendFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { Type, type TSchema } from 'typebox'
import { RING_FROM, RING_TO, RINGS, ringRange, WEAR_ALARM_MM } from '../src/data/scenario.ts'
import { MODEL_ID, setupModel } from '../src/model.ts'

const { model, streamFn } = setupModel()
const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : undefined
// --live <file>：每条事件立即追加到文件，供 spike/live-bridge.ts 转成 SSE（正式后端完成前的临时联调手段）
const LIVE = process.argv.includes('--live') ? process.argv[process.argv.indexOf('--live') + 1] : undefined
// --question <文本> / --trigger <JSON>：由 live-bridge 按 CreateRunRequest 传入；缺省为默认问题、人工发起
const arg = (name: string) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined)
const QUESTION = arg('--question')?.trim()
const TRIGGER = arg('--trigger') ? (JSON.parse(arg('--trigger')!) as RunTrigger) : undefined
const RUN_ID = 'sample-001'
const T0 = performance.now()
const t = () => ((performance.now() - T0) / 1000).toFixed(1).padStart(5) + 's'
const N = (id: AgentId) => AGENTS[id].name
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------- 事件 ----------
const events: RunEvent[] = []
function emit<T extends RunEventType>(type: T, data: PayloadOf<T>) {
  // 深拷贝：payload 里的对象（如 Finding）之后还会被修改，不能存引用
  const e = { seq: events.length + 1, ts: Date.now(), runId: RUN_ID, type, data: structuredClone(data) } as RunEvent
  events.push(e)
  if (LIVE) {
    appendFileSync(LIVE, JSON.stringify(e) + '\n')
    if (type === 'tool.finished' || type === 'human.answered') writeFileSync(`${LIVE}.evidence.json`, JSON.stringify(Object.fromEntries(evidence)))
  }
}
// agent.delta 每 50 ms 合并一次
const deltaBuf = new Map<string, { agentId: AgentId; kind: 'thinking' | 'text'; text: string }>()
setInterval(flushDeltas, 50).unref()
function flushDeltas() {
  for (const b of deltaBuf.values()) if (b.text) emit('agent.delta', { agentId: b.agentId, kind: b.kind, delta: b.text })
  deltaBuf.clear()
}

let stage: Stage = 'snapshot'
function setStage(s: Stage, reason: 'normal' | 'timeout' = 'normal') {
  flushDeltas()
  stage = s
  emit('stage.changed', { stage: s, reason })
  console.log(`\n===== ${s}${reason === 'timeout' ? '（上一阶段超时）' : ''} =====`)
}

// ---------- 协作状态 ----------
const evidence = new Map<string, Evidence>()
const findings = new Map<string, Finding>()
// 每条表态记下发出时的判断版本：判断被修正后，旧表态不再代表对新内容的态度
type Reaction = PeerMessage & { at: number; version: number }
const reactions: Reaction[] = []
const revisedAt = new Map<string, number>() // 判断最近一次修正时的事件序号
const stats: CollabStats = { peerMessages: 0, asks: 0, humanAsks: 0, challenges: 0, endorses: 0, revisions: 0, crossCitations: 0, signoffs: 0 }
const seq = { E: 0, H: 0, F: 0, M: 0, Q: 0, S: 0 }
const nextId = (k: keyof typeof seq) => `${k}${++seq[k]}`

const ownerOf = (ref: string): AgentId | undefined => evidence.get(ref)?.owner ?? findings.get(ref)?.agentId
function checkRefs(refs: string[]) {
  const bad = refs.filter((r) => !evidence.has(r) && !findings.has(r))
  if (bad.length) throw new Error(`引用的编号不存在：${bad.join(', ')}。只能引用工具返回过的证据编号（E/H 开头）或协作板上的判断编号（F 开头）`)
}
const crossCites = (me: AgentId, refs: string[]) => refs.filter((r) => { const o = ownerOf(r); return o && o !== me }).length
const brief = (s: string | undefined, fallback: string) => (s?.trim() || fallback).slice(0, 30)
function bumpStats(patch: Partial<CollabStats>) {
  for (const [k, v] of Object.entries(patch)) stats[k as keyof CollabStats] += v as number
  emit('collab.stats', { ...stats })
}
function send(msg: Omit<PeerMessage, 'id'>) {
  const m: PeerMessage = { id: nextId('M'), ...msg }
  emit('peer.message', m)
  const peer = msg.from !== 'human' && msg.from !== 'coordinator' && msg.to !== 'all' && msg.to !== 'human' && msg.to !== 'coordinator'
  bumpStats({ peerMessages: peer ? 1 : 0, crossCitations: crossCites(msg.from, msg.refs) })
  console.log(`${t()} [${N(msg.from)} → ${msg.to === 'all' ? '全体' : N(msg.to)}] ${msg.kind}：${msg.text.replace(/\s+/g, ' ').slice(0, 150)}`)
  return m
}

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }], details: {} })
type R = ReturnType<typeof text>
function tool<S extends TSchema>(name: string, label: string, description: string, parameters: S, execute: (p: any) => Promise<R> | R): AgentTool<S> {
  return { name, label, description, parameters, execute: async (_id, p) => execute(p) }
}
const briefParam = Type.String({ description: '30 字以内的简短版本，用于画面显示' })

// ---------- 数据域工具 ----------
function dataEvidence(owner: SpecialistId, label: string, rows: Record<string, string | number | null>[], chart: ChartSpec, note = '') {
  const id = nextId('E')
  const keys = Object.keys(rows[0] ?? {})
  const csv = [keys.join(','), ...rows.map((r) => keys.map((k) => r[k] ?? '').join(','))].join('\n')
  const summary = `${label}，共 ${rows.length} 环${note}`
  evidence.set(id, { id, owner, kind: 'data', label, summary, rows, chart })
  return { id, body: `证据编号 ${id}（${label}）${note}\n${csv}` }
}
const range = Type.Object({ ringFrom: Type.Number({ description: `起始环号，最小 ${RING_FROM}` }), ringTo: Type.Number({ description: `结束环号，最大 ${RING_TO}` }) })
const line = (series: ChartSpec['series'], rows: ChartSpec['rows'], type: ChartSpec['type'] = 'line'): ChartSpec => ({ type, x: { key: 'ring', label: '环号' }, series, rows })

const DOMAIN: Record<SpecialistId, AgentTool<any>[]> = {
  geology: [
    tool('query_geology', '地质资料', '查询各环所处地层及卵石含量', range, ({ ringFrom, ringTo }) => {
      const rows = ringRange(ringFrom, ringTo).map((r) => ({ ring: r.ring, stratum: r.stratum, gravel_pct: Math.round(r.gravelContent * 100) }))
      const e = dataEvidence('geology', `地质资料 ${ringFrom}–${ringTo}`, rows, line([{ key: 'gravel_pct', label: '卵石含量', unit: '%' }], rows.map(({ ring, gravel_pct }) => ({ ring, gravel_pct })), 'step'))
      return { ...text(e.body), details: { evidenceId: e.id } }
    }),
  ],
  boring: [
    tool('query_ring_metrics', '掘进参数', '查询各环推进速度(mm/min)、贯入度(mm/r)、刀盘转速(rpm)、刀盘扭矩(kN·m)、总推力(kN)', range, ({ ringFrom, ringTo }) => {
      const rows = ringRange(ringFrom, ringTo).map((r) => ({ ring: r.ring, speed: r.advanceSpeed, penetration: r.penetration, rpm: r.cutterRpm, torque: r.torque, thrust: r.thrust }))
      const e = dataEvidence('boring', `掘进参数 ${ringFrom}–${ringTo}`, rows, line([{ key: 'speed', label: '推进速度', unit: 'mm/min' }, { key: 'torque', label: '刀盘扭矩', unit: 'kN·m' }], rows.map(({ ring, speed, torque }) => ({ ring, speed, torque }))))
      return { ...text(e.body), details: { evidenceId: e.id } }
    }),
  ],
  cutter: [
    tool('query_cutter_wear', '刀盘监测', '查询各环刀具磨损速率(mm/环)和刀具温度(°C)', range, ({ ringFrom, ringTo }) => {
      const rows = ringRange(ringFrom, ringTo).map((r) => ({ ring: r.ring, wear_mm: r.wearRate, temp_c: r.cutterTemp }))
      const e = dataEvidence('cutter', `刀盘监测 ${ringFrom}–${ringTo}`, rows, line([{ key: 'wear_mm', label: '磨损速率', unit: 'mm/环' }, { key: 'temp_c', label: '刀具温度', unit: '°C' }], rows), `；磨损报警阈值 ${WEAR_ALARM_MM} mm/环`)
      return { ...text(e.body), details: { evidenceId: e.id } }
    }),
  ],
  muck: [
    tool('query_foam', '泡沫系统', '查询各环泡沫原液流量(L/min)、发泡倍率、泡沫注入率FIR', range, ({ ringFrom, ringTo }) => {
      const rows = ringRange(ringFrom, ringTo).map((r) => ({ ring: r.ring, solution_flow: r.foamSolutionFlow, fer: r.fer, fir_pct: Math.round(r.fir * 1000) / 10 }))
      const e = dataEvidence('muck', `泡沫系统 ${ringFrom}–${ringTo}`, rows, line([{ key: 'solution_flow', label: '原液流量', unit: 'L/min' }, { key: 'fir_pct', label: 'FIR', unit: '%' }], rows.map(({ ring, solution_flow, fir_pct }) => ({ ring, solution_flow, fir_pct }))))
      return { ...text(e.body), details: { evidenceId: e.id } }
    }),
    tool('query_muck_lab', '渣土实验室', '查询渣土坍落度(mm)，正常 150–200；只有取过样的环有数据', range, ({ ringFrom, ringTo }) => {
      const rows = ringRange(ringFrom, ringTo).filter((r) => r.slump != null).map((r) => ({ ring: r.ring, slump_mm: r.slump }))
      const e = dataEvidence('muck', `渣土实验室 ${ringFrom}–${ringTo}`, rows, line([{ key: 'slump_mm', label: '坍落度', unit: 'mm' }], rows, 'bar'), '；该区间其余环未取样')
      return { ...text(e.body), details: { evidenceId: e.id } }
    }),
  ],
}

const MISSING = ['渣土实验室：仅 519、526、533 环取过样', '设备运行与报警记录：未接入', '开仓检查与换刀记录：未接入'] as const
const HUMAN_CARD: [RegExp, string][] = [
  [/渣土|出土|干|结块|坍落|螺旋/, '521 环以后出土明显偏干，有结块，螺旋机出土不太顺。'],
  [/开仓|换刀|刀具|检查/, '510 环开仓检查过，刀具正常，没有更换。'],
  [/泡沫|泵|报警|故障/, '泡沫泵 518 环左右报过一次流量低，当班没处理。'],
]

// ---------- 人工输入 ----------
// live：现场回答和负责人审核由 live-bridge 收到 POST /answer、/review 后按行写入 stdin，这里真的等人。
// 录制样本（--out）：没有人在场，现场回答按 HUMAN_CARD 模拟，审核自动批准。
const HUMAN_TIMEOUT_MS = 120_000
type HumanInput = { type: 'answer'; questionId: string; text: string } | { type: 'review'; version: number; decision: 'approve' | 'reject'; comment?: string }
const waiters = new Map<string, (m: HumanInput) => void>() // questionId 或 'review'
if (LIVE) {
  createInterface({ input: process.stdin }).on('line', (line) => {
    let m: HumanInput
    try { m = JSON.parse(line) as HumanInput } catch { return }
    const key = m.type === 'answer' ? m.questionId : 'review'
    waiters.get(key)?.(m)
    waiters.delete(key)
  })
}
/** 等人工输入；ms 为 0 表示一直等 */
function waitHuman(key: string, ms: number) {
  return new Promise<HumanInput | undefined>((resolve) => {
    const timer = ms ? setTimeout(() => { waiters.delete(key); resolve(undefined) }, ms) : undefined
    waiters.set(key, (m) => { clearTimeout(timer); resolve(m) })
  })
}

// ---------- Agent ----------
const ROLE: Record<SpecialistId, string> = {
  geology: '地质专家，负责判断地层条件对掘进的影响',
  boring: '掘进专家，负责分析掘进参数（速度、贯入度、扭矩、推力）及其变化原因',
  cutter: '刀盘专家，负责判断刀具磨损和刀盘状态',
  muck: '渣土改良专家，负责判断泡沫系统和渣土状态',
}
function systemPrompt(id: SpecialistId) {
  return `你是盾构机 TBM-01 诊断会商中的${ROLE[id]}。
会商成员：地质、掘进、刀盘、渣土四位专家，以及一位协调主持人。你只能访问${AGENTS[id].dataDomain}的数据，其他专业的数据只能通过 ask_peer 问对应专家获得。

工作原则：
- 判断必须基于证据编号（E/H 开头），不得编造数据。
- 以本专业数据为准。同伴的判断与你的数据矛盾时，必须用 challenge 质疑并附证据，不要附和。
- 被同伴的证据说服时，用 revise_finding 修改自己的判断，并在 cites 中注明采纳了谁的证据。
- 关键判断依赖系统里查不到的现场信息时，可以用 ask_human 向现场提问（每人最多 1 次）。
- 发言简洁，用中文。每个协作工具都要求给出 30 字以内的 brief。`
}

const agents = {} as Record<SpecialistId, Agent>
const settledLen = {} as Record<SpecialistId, number>
const quota = { human: new Set<SpecialistId>(), peer: new Map<string, number>() }

// usage.updated 是每个 Agent 的累计值；ask_peer 的应答分身与本人共用同一份累计
const usageOf = new Map<AgentId, { input: number; output: number }>()

/**
 * 把 Agent 事件转成契约事件。
 * quiet：应答分身用。分身与本人共用 agentId，若也推 agent.delta 会与本人正在输出的文字交错，且共用合并缓冲区；分身的回答只走 peer.message。
 * maxTurns：一次 prompt 内最多几轮模型调用，防止模型反复调工具停不下来。
 */
function bridge(agentId: AgentId, a: Agent, opts: { onTurnEnd?: () => void; quiet?: boolean; maxTurns?: number } = {}) {
  const usage = usageOf.get(agentId) ?? { input: 0, output: 0 }
  usageOf.set(agentId, usage)
  const labelOf = (name: string) => a.state.tools.find((x) => x.name === name)?.label ?? name
  let turns = 0
  if (opts.maxTurns) a.finishTurn = () => (++turns >= opts.maxTurns! ? { action: 'end' } : undefined)
  return a.subscribe((e: AgentEvent) => {
    switch (e.type) {
      case 'agent_start': turns = 0; if (!opts.quiet) emit('agent.status', { agentId, status: 'thinking' }); break
      case 'agent_end': if (!opts.quiet) { flushDeltas(); emit('agent.status', { agentId, status: 'done' }) } break
      case 'message_update': {
        if (opts.quiet) break
        const ev = e.assistantMessageEvent
        if (ev.type !== 'text_delta' && ev.type !== 'thinking_delta') break
        const kind = ev.type === 'text_delta' ? 'text' : 'thinking'
        const key = `${agentId}:${kind}`
        const b = deltaBuf.get(key) ?? { agentId, kind, text: '' }
        b.text += ev.delta
        deltaBuf.set(key, b)
        break
      }
      case 'tool_execution_start':
        flushDeltas()
        emit('agent.status', { agentId, status: 'tool', detail: labelOf(e.toolName) })
        emit('tool.started', { agentId, callId: e.toolCallId, tool: e.toolName, label: labelOf(e.toolName), args: e.args })
        break
      case 'tool_execution_end': {
        const evidenceId = (e.result?.details as { evidenceId?: string } | undefined)?.evidenceId
        const ev = evidenceId ? evidence.get(evidenceId) : undefined
        const out = e.result?.content?.map((c: { type: string; text?: string }) => c.text ?? '').join('') ?? ''
        emit('tool.finished', { agentId, callId: e.toolCallId, tool: e.toolName, isError: e.isError, summary: ev?.summary ?? out.slice(0, 120), evidenceId, chart: ev?.chart })
        emit('agent.status', { agentId, status: 'thinking' })
        if (e.isError) console.log(`${t()} (${N(agentId)} 工具出错 ${e.toolName}: ${out.slice(0, 120)})`)
        break
      }
      case 'turn_end':
        if (e.message.role === 'assistant') {
          usage.input += e.message.usage.input
          usage.output += e.message.usage.output
          emit('usage.updated', { agentId, inputTokens: usage.input, outputTokens: usage.output })
        }
        opts.onTurnEnd?.()
        break
    }
  })
}

// ---------- 运行保护：模型出错重试、阶段超时、转录修复 ----------
const clones = new Set<Agent>() // 正在回答 ask_peer 的分身，阶段超时时一并中止

/** 去掉末尾失败 / 中止的回复，以及没有拿到全部工具结果的工具调用，避免下一次请求被模型接口拒绝 */
function sanitize(a: Agent) {
  const ms = a.state.messages.slice()
  for (;;) {
    const last = ms.at(-1)
    if (last?.role === 'assistant' && (last.stopReason === 'error' || last.stopReason === 'aborted')) { ms.pop(); continue }
    break
  }
  const i = ms.findLastIndex((m) => m.role === 'assistant')
  const calls = i >= 0 && ms[i].role === 'assistant' ? ms[i].content.filter((c) => c.type === 'toolCall').map((c) => c.id) : []
  const done = new Set(ms.slice(i + 1).flatMap((m) => (m.role === 'toolResult' ? [m.toolCallId] : [])))
  if (calls.some((id) => !done.has(id))) ms.length = i
  if (ms.length !== a.state.messages.length) a.state.messages = ms
}

/**
 * prompt 的安全版本。pi-agent-core 遇到模型接口报错（限流、断网）不会抛异常，只会追加一条 stopReason=error 的空回复并正常结束，
 * 不检查的话这位专家会悄无声息地缺席。这里最多重试 2 次，仍失败则发 agent.status(error)。
 */
async function promptSafe(id: AgentId, a: Agent, content: string): Promise<boolean> {
  await a.prompt(content)
  for (let attempt = 1; ; attempt++) {
    const last = a.state.messages.at(-1)
    if (last?.role !== 'assistant' || last.stopReason !== 'error') return last?.role !== 'assistant' || last.stopReason !== 'aborted'
    if (attempt > 2) {
      emit('agent.status', { agentId: id, status: 'error', detail: `模型调用失败：${(last.errorMessage ?? '').slice(0, 60)}` })
      console.log(`${t()} (${N(id)} 模型调用连续失败，放弃：${last.errorMessage})`)
      sanitize(a)
      return false
    }
    console.log(`${t()} (${N(id)} 模型调用失败，${attempt * 3}s 后第 ${attempt} 次重试：${last.errorMessage})`)
    await sleep(attempt * 3000)
    sanitize(a)
    try { await a.continue() } catch { return false }
  }
}

/** 给某位 Agent 补一条信息：正在运行就插入当前对话，否则直接写进它的记录，下次发言时能看到 */
function tell(id: SpecialistId, content: string) {
  const a = agents[id]
  const msg = { role: 'user' as const, content, timestamp: Date.now() }
  if (a.state.isStreaming) a.steer(msg)
  else a.state.messages = [...a.state.messages, msg]
}

/** 阶段限时：超时则中止所有 Agent，返回 true，由调用方以 reason=timeout 进入下一阶段 */
async function timed(label: string, ms: number, work: Promise<unknown>) {
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'timeout'>((r) => { timer = setTimeout(() => r('timeout'), ms) })
  const result = await Promise.race([work.then(() => 'ok' as const), timeout])
  clearTimeout(timer)
  if (result === 'ok') return false
  console.log(`${t()} (${label}超过 ${ms / 1000}s，中止所有 Agent)`)
  for (const a of [...Object.values(agents), coordinator, ...clones]) a.abort()
  await work.catch(() => {})
  for (const a of [...Object.values(agents), coordinator]) sanitize(a)
  return true
}

function steerOthers(me: SpecialistId, content: string) {
  if (stage === 'solo') return // 背靠背阶段不广播
  for (const other of SPECIALISTS) if (other !== me && agents[other].state.isStreaming)
    agents[other].steer({ role: 'user', content, timestamp: Date.now() })
}

const react = (f: Finding, m: PeerMessage) => reactions.push({ ...m, at: events.length, version: f.version })

function collabTools(me: SpecialistId): AgentTool<any>[] {
  const roleT = Type.Union([Type.Literal('primary'), Type.Literal('secondary'), Type.Literal('ruled_out'), Type.Literal('open')], { description: 'primary 主因 / secondary 次因 / ruled_out 排除 / open 待定' })
  const peerT = Type.Union(SPECIALISTS.filter((s) => s !== me).map((s) => Type.Literal(s)), { description: 'geology 地质 / boring 掘进 / cutter 刀盘 / muck 渣土' })
  const mineOrThrow = (id: string) => { const f = findings.get(id); if (!f || f.agentId !== me) throw new Error('只能操作你自己的判断'); return f }
  const othersOrThrow = (id: string) => { const f = findings.get(id); if (!f) throw new Error(`没有 ${id}`); if (f.agentId === me) throw new Error('不能对自己的判断表态'); return f }
  return [
    tool('post_finding', '发布判断', '把你的判断发布到共享协作板', Type.Object({
      claim: Type.String({ description: '判断内容，一句话' }), brief: briefParam, role: roleT,
      confidence: Type.Number({ description: '0 到 1' }), evidence: Type.Array(Type.String(), { description: '支持该判断的证据编号' }),
    }), (p) => {
      checkRefs(p.evidence)
      const f: Finding = { id: nextId('F'), agentId: me, claim: p.claim, brief: brief(p.brief, p.claim), role: p.role, confidence: p.confidence, evidence: p.evidence, version: 1 }
      findings.set(f.id, f)
      emit('finding.posted', { finding: f })
      bumpStats({ crossCitations: crossCites(me, p.evidence) })
      console.log(`${t()} [${N(me)}] 发布 ${f.id} [${f.role} ${f.confidence}] ${f.brief}`)
      steerOthers(me, `[协作板] ${N(me)} 发布了 ${f.id}：${p.claim}（${p.role}，置信度 ${p.confidence}）`)
      return text(`已发布 ${f.id}`)
    }),
    tool('ask_peer', '向同伴提问', '向另一位专家提问，对方会查询他的数据回答', Type.Object({ to: peerT, question: Type.String(), brief: briefParam }), async ({ to, question, brief: b }) => {
      const key = `${stage}:${me}`
      const used = (quota.peer.get(key) ?? 0) + 1
      if (used > 2) throw new Error('本阶段你已经提问 2 次，请根据已有信息作出判断')
      quota.peer.set(key, used)
      const ask = send({ from: me, to, kind: 'ask', brief: brief(b, question), text: question, refs: [] })
      bumpStats({ asks: 1 })
      emit('agent.status', { agentId: me, status: 'waiting', detail: `等待${N(to)}回答` })
      const { answer, refs } = await answerAs(to, me, question)
      send({ from: to, to: me, kind: 'answer', brief: brief(undefined, answer), text: answer, refs, replyTo: ask.id })
      return text(`${N(to)}的回答：${answer}`)
    }),
    tool('ask_human', '向现场提问', '向现场施工人员提问系统里查不到的信息（每人最多 1 次，全队最多 2 次）', Type.Object({
      gap: Type.Union(MISSING.map((m) => Type.Literal(m)), { description: '缺的是哪一项数据' }), question: Type.String(), brief: briefParam,
    }), async ({ gap, question, brief: b }) => {
      if (quota.human.has(me)) throw new Error('你已经问过现场一次了')
      if (quota.human.size >= 2) throw new Error('本次会商向现场提问的次数已用完')
      quota.human.add(me)
      const questionId = nextId('Q')
      emit('human.asked', { questionId, agentId: me, gap, question, brief: brief(b, question) })
      bumpStats({ humanAsks: 1 })
      console.log(`${t()} [${N(me)} → 现场] 提问（${gap}）：${question.slice(0, 120)}`)
      emit('agent.status', { agentId: me, status: 'waiting', detail: '等待现场回答' })
      let reply: string | undefined
      if (LIVE) {
        const m = await waitHuman(questionId, HUMAN_TIMEOUT_MS)
        reply = m?.type === 'answer' ? m.text.trim() : undefined
      } else {
        await sleep(2500) // 模拟人工回答耗时
        reply = HUMAN_CARD.find(([re]) => re.test(question))?.[1] ?? '不清楚。'
      }
      if (!reply) {
        emit('human.answered', { questionId, timeout: true })
        console.log(`${t()} [现场 → ${N(me)}] 超时未回答`)
        return text('现场在规定时间内没有回答。请基于已有数据作出判断，并在判断中注明这项信息缺失。')
      }
      const id = nextId('H')
      evidence.set(id, { id, owner: 'human', kind: 'human', label: '现场确认', summary: reply })
      emit('human.answered', { questionId, evidenceId: id, text: reply })
      console.log(`${t()} [现场 → ${N(me)}] ${id}：${reply}`)
      steerOthers(me, `[协作板] 现场回答了${N(me)}的提问，证据 ${id}：${reply}`)
      return text(`现场回答（证据编号 ${id}）：${reply}`)
    }),
    tool('read_board', '查看协作板', '查看协作板上所有判断及其收到的质疑和赞同', Type.Object({}), () => text(boardDigest())),
    tool('challenge', '质疑', '质疑其他专家的判断，必须附上你的证据', Type.Object({ findingId: Type.String(), argument: Type.String(), brief: briefParam, evidence: Type.Array(Type.String()) }), (p) => {
      const f = othersOrThrow(p.findingId)
      checkRefs(p.evidence)
      react(f, send({ from: me, to: f.agentId, kind: 'challenge', brief: brief(p.brief, p.argument), text: p.argument, refs: p.evidence, findingId: f.id }))
      bumpStats({ challenges: 1 })
      steerOthers(me, `[协作板] ${N(me)} 质疑了 ${f.id}（${N(f.agentId)}）：${p.argument}`)
      return text('已提交质疑')
    }),
    tool('endorse', '赞同', '赞同其他专家的判断，可补充证据', Type.Object({ findingId: Type.String(), note: Type.String(), brief: briefParam, evidence: Type.Array(Type.String()) }), (p) => {
      const f = othersOrThrow(p.findingId)
      checkRefs(p.evidence)
      react(f, send({ from: me, to: f.agentId, kind: 'endorse', brief: brief(p.brief, p.note), text: p.note, refs: p.evidence, findingId: f.id }))
      bumpStats({ endorses: 1 })
      return text('已提交赞同')
    }),
    tool('revise_finding', '修正判断', '修改你自己的判断，并注明采纳了谁的证据', Type.Object({
      findingId: Type.String(), claim: Type.String(), brief: briefParam, role: roleT, confidence: Type.Number(),
      reason: Type.String(), cites: Type.Array(Type.String(), { description: '促使你修改的证据或判断编号' }),
    }), (p) => {
      const f = mineOrThrow(p.findingId)
      checkRefs(p.cites)
      const before: FindingCore = { claim: f.claim, brief: f.brief, role: f.role, confidence: f.confidence }
      const after: FindingCore = { claim: p.claim, brief: brief(p.brief, p.claim), role: p.role, confidence: p.confidence }
      Object.assign(f, after, { version: f.version + 1 })
      revisedAt.set(f.id, events.length + 1)
      emit('finding.revised', { findingId: f.id, agentId: me, before, after, reason: p.reason, cites: p.cites, version: f.version })
      bumpStats({ revisions: 1, crossCitations: crossCites(me, p.cites) })
      console.log(`${t()} [${N(me)}] 修正 ${f.id}：[${before.role} ${before.confidence}] → [${after.role} ${after.confidence}] ${after.brief}；${p.cites.join(',')}`)
      steerOthers(me, `[协作板] ${N(me)} 修正了 ${f.id}：${p.claim}（${p.role}，置信度 ${p.confidence}）`)
      return text(`已修正 ${f.id}`)
    }),
    tool('defend', '坚持判断', '回应质疑并坚持自己的判断，须给出新的理由或证据', Type.Object({ findingId: Type.String(), argument: Type.String(), brief: briefParam, evidence: Type.Array(Type.String()) }), (p) => {
      const f = mineOrThrow(p.findingId)
      checkRefs(p.evidence)
      react(f, send({ from: me, to: 'all', kind: 'defend', brief: brief(p.brief, p.argument), text: p.argument, refs: p.evidence, findingId: f.id }))
      steerOthers(me, `[协作板] ${N(me)} 坚持 ${f.id}：${p.argument}`)
      return text('已提交')
    }),
  ]
}

// ask_peer 的应答分身：用被问方已完成的上下文临时起一个 Agent 回答，不阻塞被问方
async function answerAs(target: SpecialistId, asker: SpecialistId, question: string) {
  const base = agents[target].state.messages.slice(0, settledLen[target] ?? 0).filter((m) => m.role !== 'system') as AgentMessage[]
  const clone = new Agent({ initialState: { systemPrompt: systemPrompt(target), model, thinkingLevel: 'low', tools: DOMAIN[target], messages: base }, streamFn })
  // 只收分身自己查出的证据；按全局编号区间推算会把并发中其他人查的证据也算进来
  const refs: string[] = []
  const offRefs = clone.subscribe((e) => {
    const id = e.type === 'tool_execution_end' ? (e.result?.details as { evidenceId?: string } | undefined)?.evidenceId : undefined
    if (id) refs.push(id)
  })
  const off = bridge(target, clone, { quiet: true, maxTurns: 6 })
  clones.add(clone)
  await promptSafe(target, clone, `${N(asker)}专家问你：${question}\n只回答这个问题：查询你的数据，用 100 字以内回答，引用证据编号。不要发布判断，也不要表态。`)
  clones.delete(clone)
  off()
  offRefs()
  emit('agent.status', { agentId: target, status: agents[target].state.isStreaming ? 'thinking' : 'done' })
  const answer = lastText(clone) || '（未能回答）'
  tell(target, `[协作记录] 你刚回答了${N(asker)}的提问「${question}」：${answer}`)
  return { answer, refs }
}

function lastText(a: Agent) {
  const m = a.state.messages.at(-1)
  return m?.role === 'assistant' ? m.content.filter((c) => c.type === 'text').map((c) => c.text).join('').trim() : ''
}

const LABEL = { challenge: '质疑', endorse: '赞同', defend: '坚持' } as Record<string, string>

/** 判断 f 上还没被提出者回应（修正或坚持）的质疑 */
function openChallenges(f: Finding) {
  const rs = reactions.filter((r) => r.findingId === f.id)
  const answered = Math.max(revisedAt.get(f.id) ?? 0, ...rs.filter((r) => r.from === f.agentId && r.kind === 'defend').map((r) => r.at))
  return rs.filter((r) => r.kind === 'challenge' && r.at > answered)
}

function boardDigest(except?: SpecialistId) {
  return [...findings.values()].filter((f) => f.agentId !== except).map((f) => {
    const rs = reactions.filter((r) => r.findingId === f.id).map((r) => `  - ${N(r.from)} ${LABEL[r.kind]}${r.version < f.version ? `（针对旧版 v${r.version}）` : ''}：${r.text} ${r.refs.join(',')}`)
    const open = openChallenges(f).length ? ` 【${openChallenges(f).length} 条质疑未回应】` : ''
    return [`${f.id}（${N(f.agentId)}提出，v${f.version}）[${f.role} ${f.confidence}] ${f.claim} 证据 ${f.evidence.join(',')}${open}`, ...rs].join('\n')
  }).join('\n')
}

/**
 * 某位专家还欠着的回应。质疑和修正发生时，对方可能已经结束本轮发言，插入的消息要等到下一阶段才会被看到，
 * 质疑 → 回应的链条就断了。所以每个阶段发言结束后按这里的清单逐人点名补回应。
 */
function obligations(me: SpecialistId): string[] {
  const out: string[] = []
  for (const f of findings.values()) {
    if (f.agentId === me) {
      for (const c of openChallenges(f)) out.push(`- ${N(c.from)}质疑你的 ${f.id}：${c.text}（证据 ${c.refs.join(',') || '无'}）→ 被说服就用 revise_finding 修正并在 cites 注明，不同意就用 defend 给出新理由`)
      continue
    }
    const mine = reactions.filter((r) => r.findingId === f.id && r.from === me && (r.kind === 'endorse' || r.kind === 'challenge'))
    const last = mine.at(-1)
    if (!last) continue
    if (last.version < f.version) {
      out.push(`- ${N(f.agentId)}的 ${f.id} 在你${LABEL[last.kind]}之后已修正为：${f.claim}（${f.role}，置信度 ${f.confidence}）→ 用你的数据重新表态：endorse 或 challenge`)
      continue
    }
    const defended = reactions.find((r) => r.findingId === f.id && r.kind === 'defend' && r.at > last.at)
    if (last.kind === 'challenge' && defended) out.push(`- ${N(f.agentId)}针对你的质疑坚持 ${f.id}：${defended.text}（证据 ${defended.refs.join(',') || '无'}）→ 被说服就 endorse，仍不同意就再 challenge 并给出新证据`)
  }
  return out
}

/** 点名补回应，最多 rounds 轮；没有欠账就结束 */
async function settle(ids: SpecialistId[], rounds: number) {
  for (let i = 1; i <= rounds; i++) {
    const todo = ids.map((id) => [id, obligations(id)] as const).filter(([, items]) => items.length)
    if (!todo.length) return
    console.log(`${t()} ----- 回应轮 ${i}：${todo.map(([id, items]) => `${N(id)} ${items.length} 项`).join('，')}`)
    await Promise.all(todo.map(([id, items]) => promptSafe(id, agents[id], `以下事项需要你回应，请逐条处理：\n${items.join('\n')}`)))
  }
}

for (const id of SPECIALISTS) {
  const a = new Agent({ initialState: { systemPrompt: systemPrompt(id), model, thinkingLevel: 'low', tools: [] }, streamFn })
  bridge(id, a, { onTurnEnd: () => { settledLen[id] = a.state.messages.length }, maxTurns: 16 })
  agents[id] = a
}

// ---------- 协调 ----------
const sessions: { id: string; topic: string }[] = []
let conclusion: Conclusion | undefined
let version = 0 // 结论版本：有专家会签不同意时重新起草
const coordinator = new Agent({
  initialState: {
    systemPrompt: '你是 TBM-01 诊断会商的协调主持人。你不访问任何数据，只根据协作板组织讨论、形成结论。发言简洁，用中文。',
    model, thinkingLevel: 'low',
    tools: [
      tool('open_session', '发起专项会商', '针对一个尚未解决的分歧发起专项会商，被质疑方须回应，其他参与者可补证。会商结束后返回讨论结果', Type.Object({
        topic: Type.String({ description: '会商主题' }),
        participants: Type.Array(Type.Union(SPECIALISTS.map((s) => Type.Literal(s)))),
        findingIds: Type.Array(Type.String(), { description: '涉及的判断编号' }),
      }), async ({ topic, participants, findingIds }) => {
        if (sessions.length >= 2) throw new Error('专项会商最多 2 轮')
        const sessionId = nextId('S')
        sessions.push({ id: sessionId, topic })
        emit('session.opened', { sessionId, topic, participants, findingIds })
        console.log(`${t()} [协调] 发起会商 ${sessionId}：${topic}（${participants.map(N).join('、')}）`)
        const mark = reactions.length
        await Promise.all((participants as SpecialistId[]).map((id) => {
          const mine = findingIds.filter((f: string) => findings.get(f)?.agentId === id)
          const ask = mine.length
            ? `你的判断 ${mine.join('、')} 是本次会商的焦点。针对收到的质疑，要么用 revise_finding 修正（注明采纳的证据），要么用 defend 给出新理由坚持。`
            : `请用你的数据对 ${findingIds.join('、')} 补充证据：一致用 endorse，矛盾用 challenge。`
          return promptSafe(id, agents[id], `[专项会商 ${sessionId}] 主题：${topic}\n当前协作板：\n${boardDigest()}\n\n${ask}`)
        }))
        await settle(participants as SpecialistId[], 1)
        const happened = reactions.slice(mark).map((r) => `${N(r.from)} ${r.kind} ${r.findingId}：${r.text}`).join('\n')
        return text(`会商 ${sessionId} 结束。期间发言：\n${happened || '（无新发言）'}\n\n协作板最新状态：\n${boardDigest()}`)
      }),
      tool('close_session', '结束会商', '宣布专项会商的结果', Type.Object({ sessionId: Type.String(), outcome: Type.String() }), ({ sessionId, outcome }) => {
        emit('session.closed', { sessionId, outcome })
        console.log(`${t()} [协调] 结束会商 ${sessionId}：${outcome.slice(0, 120)}`)
        return text('已结束')
      }),
      tool('draft_conclusion', '起草结论', '起草最终结论，每条原因都要引用协作板上的判断编号和证据编号', Type.Object({
        primary: Type.Object({ cause: Type.String(), findings: Type.Array(Type.String()), evidence: Type.Array(Type.String()) }),
        secondary: Type.Array(Type.Object({ cause: Type.String(), findings: Type.Array(Type.String()), evidence: Type.Array(Type.String()) })),
        ruledOut: Type.Array(Type.Object({ cause: Type.String(), findings: Type.Array(Type.String()), evidence: Type.Array(Type.String()) })),
        actions: Type.Array(Type.String()),
        dataGaps: Type.Array(Type.String()),
      }), (c: Conclusion) => {
        for (const x of [c.primary, ...c.secondary, ...c.ruledOut]) checkRefs([...x.findings, ...x.evidence])
        conclusion = c
        emit('conclusion.drafted', { version: ++version, conclusion: c })
        console.log(`${t()} [协调] 起草结论：主因 ${c.primary.cause}`)
        return { ...text('结论已起草'), terminate: true }
      }),
    ],
  },
  streamFn,
})
bridge('coordinator', coordinator, { maxTurns: 16 })
// 会商必须一场一场开：并行开会会让同一位专家同时被两场会商调用
coordinator.state.tools.find((x) => x.name === 'open_session')!.executionMode = 'sequential'

// ---------- 会商流程 ----------
const EVENT = QUESTION || `TBM-01 当前掘进到 ${RING_TO} 环。从 521 环起推进速度明显下降，请会商找出原因。`
const TITLE = QUESTION ? `TBM-01 · ${QUESTION.split(/[。？?！!\n]/)[0].slice(0, 24)}` : 'TBM-01 · 521 环起推进速度下降'
emit('run.started', { scenarioId: 'tbm01-efficiency', title: TITLE, question: EVENT, model: `deepseek/${MODEL_ID}`, ...(TRIGGER && { trigger: TRIGGER }) })
emit('snapshot.created', {
  rings: [RING_FROM, RING_TO], currentRing: RING_TO,
  sources: [{ owner: 'geology', label: '地质资料' }, { owner: 'boring', label: '掘进参数' }, { owner: 'cutter', label: '刀盘监测' }, { owner: 'muck', label: '泡沫系统' }, { owner: 'muck', label: '渣土实验室' }],
  missing: [...MISSING],
})
const missingNote = `数据快照的缺失项：${MISSING.join('；')}。`

// 各阶段限时（毫秒）。背靠背阶段要容纳现场回答的等待时间
const LIMIT = { solo: HUMAN_TIMEOUT_MS + 180_000, review: 420_000, session: 480_000, signoff: 240_000 }

setStage('solo')
const SOLO = new Set(['post_finding', 'ask_human'])
for (const id of SPECIALISTS) agents[id].state.tools = [...DOMAIN[id], ...collabTools(id).filter((x) => SOLO.has(x.name))]
let late = await timed('背靠背研判', LIMIT.solo, Promise.all(SPECIALISTS.map((id) => promptSafe(id, agents[id], `${EVENT}\n${missingNote}\n本阶段为背靠背独立研判：只根据你本专业的数据（${RING_FROM}–${RING_TO} 环）作出判断，不与同伴交流。需要时可以向现场提问。然后用 post_finding 发布 1–2 条判断，说明你认为的原因。`))))

if (!findings.size) {
  // 没有任何判断（模型全部调用失败或超时），后面的互评与会商无从进行，直接结束，避免白白调用模型
  emit('run.finished', { status: 'failed', error: '背靠背研判阶段没有专家给出判断（模型调用失败或超时），会商无法继续' })
  flushDeltas()
  process.exit(1)
}

setStage('review', late ? 'timeout' : 'normal')
for (const id of SPECIALISTS) agents[id].state.tools = [...DOMAIN[id], ...collabTools(id)]
late = await timed('交叉互评', LIMIT.review, (async () => {
  await Promise.all(SPECIALISTS.map((id) => promptSafe(id, agents[id], `协作板上其他专家的判断：\n${boardDigest(id)}\n\n请用你的数据逐条检验：与你的数据一致的用 endorse，矛盾的用 challenge（附证据）。至少对 2 位不同的同伴表态。\n如果某条判断涉及的数据你看不到、无法直接验证（例如别人引用了你没有的数据，或你想知道对方数据在某几环的具体情况），先用 ask_peer 向相关专家追问，拿到回答后再表态。`)))
  await settle(SPECIALISTS, 2) // 本轮发言里收到的质疑、被修正的判断，逐人点名补回应
})())

setStage('session', late ? 'timeout' : 'normal')
late = await timed('专项会商', LIMIT.session, (async () => {
  await promptSafe('coordinator', coordinator, `协作板当前状态：\n${boardDigest()}\n\n请找出尚未解决的分歧（标有【质疑未回应】的判断，或回应后双方仍各执一词的判断），用 open_session 发起专项会商（最多 2 轮），每轮会商后用 close_session 宣布结果。没有分歧时可以跳过会商。最后用 draft_conclusion 起草结论。`)
  if (!conclusion) await promptSafe('coordinator', coordinator, '你还没有起草结论。请现在用 draft_conclusion 起草。')
})())

/** 一轮会签；没调用 sign_off 的专家再催一次 */
async function signoffRound(v: number) {
  const signed = new Map<SpecialistId, { agree: boolean; note?: string }>()
  const c = conclusion!
  const view = `主因：${c.primary.cause}\n次因：${c.secondary.map((x) => x.cause).join('；')}\n已排除：${c.ruledOut.map((x) => x.cause).join('；')}\n建议：${c.actions.join('；')}`
  for (const id of SPECIALISTS) agents[id].state.tools = [tool('sign_off', '会签', '对结论草案会签', Type.Object({ agree: Type.Boolean(), note: Type.Optional(Type.String({ description: '保留意见，同意时可不填' })) }), ({ agree, note }) => {
    if (signed.has(id)) throw new Error('你已经会签过这一版')
    signed.set(id, { agree, note })
    emit('signoff.submitted', { agentId: id, version: v, agree, note })
    bumpStats({ signoffs: 1 })
    console.log(`${t()} [${N(id)}] 会签 v${v}：${agree ? '同意' : '不同意'}${note ? ' ' + note.slice(0, 80) : ''}`)
    return { ...text('已会签'), terminate: true }
  })]
  await Promise.all(SPECIALISTS.map((id) => promptSafe(id, agents[id], `协调起草的结论（版本 ${v}）：\n${view}\n\n请用 sign_off 会签：同意（可附保留意见），或者不同意并说明理由。`)))
  const missing = SPECIALISTS.filter((id) => !signed.has(id))
  if (missing.length) await Promise.all(missing.map((id) => promptSafe(id, agents[id], '你还没有会签。请现在调用 sign_off。')))
  return signed
}

if (conclusion) {
  setStage('signoff', late ? 'timeout' : 'normal')
  late = await timed('结论会签', LIMIT.signoff, (async () => {
    const signed = await signoffRound(version)
    const against = [...signed].filter(([, x]) => !x.agree)
    if (!against.length) return
    // 有专家不同意：协调按反对意见修订一次，重新会签
    coordinator.state.tools = coordinator.state.tools.filter((x) => x.name === 'draft_conclusion')
    const before = version
    await promptSafe('coordinator', coordinator, `结论 v${version} 会签时有专家不同意：\n${against.map(([id, x]) => `- ${N(id)}：${x.note ?? '（未说明理由）'}`).join('\n')}\n\n请针对反对意见用 draft_conclusion 修订结论；理由不成立的部分可以保留，但要在结论中如实体现分歧。`)
    if (version > before) {
      stats.signoffs = 0
      await signoffRound(version)
    }
  })())

  setStage('approval', late ? 'timeout' : 'normal')
  let review: Extract<HumanInput, { type: 'review' }>
  if (LIVE) {
    review = (await waitHuman('review', 0)) as typeof review // 一直等负责人审核；不想等可调 /abort
  } else {
    await sleep(1500)
    review = { type: 'review', version, decision: 'approve', comment: '同意。（录制样本中为模拟审核）' }
  }
  emit('review.decided', { version: review.version, decision: review.decision, comment: review.comment })
  setStage('closed')
  emit('run.finished', { status: 'completed' })
} else {
  console.log('协调没有起草结论')
  emit('run.finished', { status: 'failed', error: '协调主持人没有起草结论' })
}
flushDeltas()

console.log(`\n===== 统计（${t()}，事件 ${events.length} 条） =====`)
console.log(stats)
if (OUT) {
  writeFileSync(OUT, events.map((e) => JSON.stringify(e)).join('\n') + '\n')
  // 前端回放模式用：证据详情（对应 GET /evidence/:eid）和左栏曲线（对应 GET /data/rings）
  const dir = OUT.slice(0, OUT.lastIndexOf('/') + 1)
  writeFileSync(`${dir}sample-evidence.json`, JSON.stringify(Object.fromEntries(evidence), null, 1))
  const rings: RingPoint[] = RINGS.map((r) => ({ ring: r.ring, advanceSpeed: r.advanceSpeed, torque: r.torque, thrust: r.thrust, fir: r.fir, gravelContent: r.gravelContent }))
  writeFileSync(`${dir}sample-rings.json`, JSON.stringify(rings))
  console.log(`已写入 ${OUT}、${dir}sample-evidence.json、${dir}sample-rings.json`)
}
process.exit(0)
