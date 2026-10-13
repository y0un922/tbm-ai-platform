// 协作网络（主画面左栏）。四位专家平级围成一张网，不画调用层级：
// 连线随交流长出并常驻，越多越粗，角标是各类交互的次数；正在发生的交流用彗星光点从发言人飞向对方，发言人朝对方倾身。
import { AGENTS, SPECIALISTS, type AgentId, type PeerMessage, type SpecialistId } from '@tbm/shared'
import { EdgeLabelRenderer, Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import { Gavel, HardHat, Lock } from 'lucide-react'
import { animate, AnimatePresence, motion, useMotionValue, useTransform, type MotionValue } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { edgeKey, type ViewState } from '../state/reducer.ts'
import { AGENT_ICON, BRAND, HUMAN_COLOR, INK, KIND, STATUS } from './labels.ts'
import { RoleChip, Seal } from './ui.tsx'

const ACTIVE_MS = 2600 // 一次交流在画面上"正在发生"的时长（事件时钟）
const KIND_ORDER = ['challenge', 'endorse', 'ask', 'answer', 'defend'] as const

type Pt = { x: number; y: number }
type Emphasis = 'none' | 'focus' | 'dim'

// 固定坐标（节点中心）。协调只是一侧的主持人，不在网的中心
const POS: Record<AgentId, Pt> = {
  geology: { x: -340, y: -185 },
  cutter: { x: 340, y: -185 },
  boring: { x: -340, y: 185 },
  muck: { x: 340, y: 185 },
  coordinator: { x: 0, y: -345 },
  human: { x: 0, y: 345 },
}

// ---------- 几何 ----------

/** 二次曲线控制点：四条边向外弯；两条对角线向下弯，绕开中央的共识核 */
function control(a: AgentId, b: AgentId): Pt {
  const p = POS[a], q = POS[b]
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2
  const d = Math.hypot(mx, my)
  if (d > 40) return { x: mx + (mx / d) * 70, y: my + (my / d) * 70 }
  let ux = -(q.y - p.y), uy = q.x - p.x
  const l = Math.hypot(ux, uy)
  ux /= l; uy /= l
  if (uy < 0) { ux = -ux; uy = -uy }
  return { x: mx + ux * 380, y: my + uy * 380 }
}

function quad(p: Pt, c: Pt, q: Pt, t: number): Pt {
  const u = 1 - t
  return { x: u * u * p.x + 2 * u * t * c.x + t * t * q.x, y: u * u * p.y + 2 * u * t * c.y + t * t * q.y }
}

function toward(from: Pt, to: Pt, dist: number): Pt {
  const dx = to.x - from.x, dy = to.y - from.y, l = Math.hypot(dx, dy) || 1
  return { x: (dx / l) * dist, y: (dy / l) * dist }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

// ---------- 彗星：一条消息从发言人飞向对方 ----------

function CometDot({ t, i, p, c, q, color }: { t: MotionValue<number>; i: number; p: Pt; c: Pt; q: Pt; color: string }) {
  const lag = i * 0.03
  const cx = useTransform(t, (v) => quad(p, c, q, clamp01(v - lag)).x)
  const cy = useTransform(t, (v) => quad(p, c, q, clamp01(v - lag)).y)
  const a = 1 - i * 0.13
  const opacity = useTransform(t, [0, 0.06, 0.92, 1], [0, a, a, 0])
  return <motion.circle cx={cx} cy={cy} r={i === 0 ? 7 : Math.max(1.5, 6 - i * 0.7)} fill={color} style={{ opacity }} />
}

function Comet({ p, c, q, color }: { p: Pt; c: Pt; q: Pt; color: string }) {
  const t = useMotionValue(0)
  useEffect(() => {
    const ctl = animate(t, 1, { duration: 1.15, ease: [0.65, 0, 0.35, 1] })
    return () => ctl.stop()
  }, [t])
  const hx = useTransform(t, (v) => quad(p, c, q, v).x)
  const hy = useTransform(t, (v) => quad(p, c, q, v).y)
  const halo = useTransform(t, [0, 0.06, 0.92, 1], [0, 0.22, 0.22, 0])
  return (
    <g>
      <motion.circle cx={hx} cy={hy} r={18} fill={color} style={{ opacity: halo }} />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <CometDot key={i} t={t} i={i} p={p} c={c} q={q} color={color} />)}
    </g>
  )
}

// ---------- 连线 ----------

interface Flight { id: string; from: AgentId; color: string }

type NetEdgeData = {
  kind: 'peer' | 'human' | 'session'
  a: AgentId
  b: AgentId
  counts: Partial<Record<PeerMessage['kind'], number>>
  total: number
  flights: Flight[]
  emphasis: Emphasis
  onPick: () => void
}
type NetEdge = Edge<NetEdgeData, 'net'>

function NetEdgeView({ data }: EdgeProps<NetEdge>) {
  if (!data) return null
  const { a, b, kind, emphasis } = data
  const p = POS[a], q = POS[b], c = control(a, b)
  const d = `M ${p.x} ${p.y} Q ${c.x} ${c.y} ${q.x} ${q.y}`
  const mid = quad(p, c, q, 0.5)
  const width = kind === 'peer' ? 1.5 + Math.min(data.total, 14) * 0.55 : 1.6
  const color = kind === 'human' ? HUMAN_COLOR : kind === 'session' ? BRAND : INK
  const opacity = emphasis === 'dim' ? 0.05 : emphasis === 'focus' ? 0.8 : kind === 'peer' ? 0.2 : 0.55
  const live = data.flights.at(-1)

  return (
    <>
      <path d={d} fill="none" stroke="transparent" strokeWidth={28} />
      {kind === 'peer' ? (
        <motion.path d={d} fill="none" stroke={color} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1, strokeOpacity: opacity, strokeWidth: width }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
      ) : (
        <path d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width} strokeDasharray="6 6" className={kind === 'session' ? 'animate-dash' : undefined} />
      )}
      {live && (
        <motion.path key={live.id} d={d} fill="none" stroke={live.color} strokeLinecap="round" strokeWidth={width + 10} style={{ filter: 'blur(6px)' }} initial={{ opacity: 0 }} animate={{ opacity: [0, 0.45, 0] }} transition={{ duration: 2.2, times: [0, 0.3, 1] }} />
      )}
      {data.flights.map((f) => <Comet key={f.id} p={f.from === a ? p : q} c={c} q={f.from === a ? q : p} color={f.color} />)}
      {kind === 'peer' && data.total > 0 && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-auto absolute cursor-pointer"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)`, opacity: emphasis === 'dim' ? 0.2 : 1, transition: 'opacity .3s' }}
            onClick={data.onPick}
          >
            <motion.div
              key={data.total}
              initial={{ scale: 1.35 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 14 }}
              className={`flex items-center gap-2 rounded-full bg-white px-2.5 py-1 font-mono text-[13px] font-semibold shadow-[0_4px_14px_-4px_rgba(12,35,71,.25)] ring-1 ${emphasis === 'focus' ? 'ring-ink' : 'ring-line'}`}
            >
              {KIND_ORDER.filter((k) => data.counts[k]).map((k) => {
                const K = KIND[k]
                return (
                  <span key={k} className="flex items-center gap-0.5" style={{ color: K.color }}>
                    <K.icon size={13} strokeWidth={2.8} />
                    {data.counts[k]}
                  </span>
                )
              })}
            </motion.div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

// ---------- 节点 ----------

type NodeData = { id: AgentId; state: ViewState; active: ViewState['messages']; emphasis: Emphasis }

/** 节点中心的隐藏连接点：连线自己按坐标画，只需让 React Flow 认出端点 */
function Anchors() {
  const style = { opacity: 0, left: '50%', top: '50%', pointerEvents: 'none' as const }
  return (
    <>
      <Handle type="source" position={Position.Top} style={style} isConnectable={false} />
      <Handle type="target" position={Position.Top} style={style} isConnectable={false} />
    </>
  )
}

function SpecialistNode({ data }: NodeProps<Node<NodeData>>) {
  const { state, active, emphasis } = data
  const id = data.id as SpecialistId
  const meta = AGENTS[id]
  const Icon = AGENT_ICON[id]
  const view = state.agents[id]
  const speak = active.findLast((m) => m.from === id)
  const hear = active.findLast((m) => m.to === id)
  // 发言时朝对方倾身，被点名时轻微后仰
  const lean = speak && speak.to !== 'all' ? toward(POS[id], POS[speak.to], 20) : hear ? toward(POS[id], POS[hear.from], -8) : { x: 0, y: 0 }
  const findings = state.findingOrder.map((f) => state.findings[f]).filter((f) => f.agentId === id)
  const signed = state.signoffs.find((s) => s.agentId === id)
  const busy = view.status === 'thinking' || view.status === 'tool'
  const querying = view.status === 'tool'
  const inSession = state.sessions.some((s) => !s.closed && s.participants.includes(id))

  return (
    <motion.div
      animate={{ x: lean.x, y: lean.y, opacity: emphasis === 'dim' ? 0.28 : 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 15, mass: 0.9 }}
      className="relative w-[256px]"
    >
      <Anchors />
      {inSession && <motion.div className="absolute -inset-3 rounded-[22px] border-2 border-dashed border-brand/60" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} />}
      <div className={`relative overflow-hidden rounded-[10px] border bg-white px-4 pt-3.5 pb-3.5 shadow-[0_2px_8px_rgba(40,80,130,.06),0_14px_32px_-18px_rgba(12,35,71,.25)] transition-shadow ${emphasis === 'focus' ? 'border-brand shadow-[0_0_0_4px_rgba(19,111,243,.18)]' : 'border-[#cddbed]'}`}>
        {busy && (
          <div className="absolute inset-x-0 top-0 h-[3px] overflow-hidden">
            <div className="animate-scan h-full w-full bg-gradient-to-r from-transparent via-brand to-transparent" />
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#edf4ff] text-[#1f72f0]"><Icon size={20} strokeWidth={2} /></span>
          <div className="min-w-0">
            <div className="text-[18px] leading-tight font-extrabold">{meta.name}专家</div>
            <div className="text-[12px] text-muted">{meta.role}</div>
          </div>
          <span className={`ml-auto flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${busy ? 'bg-[#edf4ff] text-brand' : view.status === 'done' ? 'bg-[#e8f8f1] text-[#05965f]' : 'bg-[#eef1f5] text-[#7a889e]'}`}>
            <span className={`size-1.5 rounded-full ${busy ? 'animate-pulse bg-brand' : view.status === 'done' ? 'bg-ok' : 'bg-faint'}`} />
            {STATUS[view.status]}
          </span>
        </div>
        <div className={`relative mt-3 flex items-center gap-1.5 overflow-hidden rounded-md px-2 py-1 text-xs transition-colors ${querying ? 'bg-brand-soft text-brand' : 'bg-paper text-muted'}`}>
          <Lock size={12} strokeWidth={2.2} className="shrink-0" />
          <span className="shrink-0">{meta.dataDomain}</span>
          {querying && <span className="ml-auto truncate">{view.detail ?? '查询中'}</span>}
        </div>
        {findings.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1">
            {findings.map((f) => (
              <span key={f.id} className="flex items-center gap-1 font-mono text-[10px] text-faint">
                {f.id}
                <RoleChip role={f.role} />
              </span>
            ))}
          </div>
        )}
      </div>
      {hear && (
        <motion.div
          key={hear.id}
          className="pointer-events-none absolute inset-0 rounded-[10px]"
          style={{ boxShadow: `0 0 0 3px ${KIND[hear.kind].color}, 0 0 32px ${KIND[hear.kind].color}66` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.6, delay: 0.85, times: [0, 0.15, 1] }}
        />
      )}
      {speak?.to === 'all' && [0, 1].map((i) => (
        <motion.div
          key={`${speak.id}-${i}`}
          className="pointer-events-none absolute inset-0 rounded-[10px] border-2"
          style={{ borderColor: KIND[speak.kind].color }}
          initial={{ opacity: 0.8, scale: 1 }}
          animate={{ opacity: 0, scale: 1.4 }}
          transition={{ duration: 1.6, delay: i * 0.35, ease: 'easeOut' }}
        />
      ))}
      <AnimatePresence>
        {signed && (
          <motion.div className="absolute -right-5 -bottom-6" initial={{ scale: 2.8, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: -10, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 17 }}>
            <Seal agree={signed.agree} size={64} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function CoordinatorNode({ data }: NodeProps<Node<NodeData>>) {
  const { state, emphasis } = data
  const view = state.agents.coordinator
  const session = state.sessions.findLast((s) => !s.closed)
  const busy = view.status === 'thinking' || view.status === 'tool'
  return (
    <motion.div animate={{ opacity: emphasis === 'dim' ? 0.28 : 1 }} className={`relative flex items-center gap-3 rounded-full bg-white/90 py-2 pr-5 pl-2 shadow-[0_8px_24px_-12px_rgba(12,35,71,.25)] backdrop-blur ${emphasis === 'focus' ? 'ring-2 ring-brand' : 'ring-1 ring-line'}`}>
      <Anchors />
      <span className={`flex size-9 items-center justify-center rounded-full ${session ? 'bg-brand text-white' : 'bg-paper text-muted'}`}>
        <Gavel size={17} strokeWidth={1.8} />
      </span>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold">协调 <span className="font-normal text-muted">· 主持</span></div>
        <div className={`text-[11px] ${session ? 'text-brand' : busy ? 'text-brand' : 'text-muted'}`}>{session ? '召集专项会商' : busy ? STATUS[view.status] : '只管流程，不下判断'}</div>
      </div>
    </motion.div>
  )
}

function HumanNode({ data }: NodeProps<Node<NodeData>>) {
  const { state, emphasis } = data
  const pending = state.questionOrder.some((q) => !state.questions[q].answer)
  const asked = state.questionOrder.length
  return (
    <motion.div animate={{ opacity: emphasis === 'dim' ? 0.28 : asked || pending ? 1 : 0.55 }} className="relative flex items-center gap-3 rounded-full bg-white/90 py-2 pr-5 pl-2 shadow-[0_8px_24px_-12px_rgba(12,35,71,.25)] ring-1 ring-line backdrop-blur">
      <Anchors />
      {pending && <span className="absolute -inset-1.5 animate-ping rounded-full border-2 border-field/60 [animation-duration:1.6s]" />}
      <span className={`flex size-9 items-center justify-center rounded-full ${pending ? 'bg-field text-white' : 'bg-cyan-50 text-field'}`}>
        <HardHat size={17} strokeWidth={1.8} />
      </span>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold">现场 <span className="font-normal text-muted">· 施工人员</span></div>
        <div className={`text-[11px] ${pending ? 'text-field' : 'text-muted'}`}>{pending ? '专家在等你回答' : asked ? `被问过 ${asked} 次` : '有人问时才亮起'}</div>
      </div>
    </motion.div>
  )
}

/** 中央共识核：外环是赞同 / 质疑的比例，中间是当前领先的主因，结论起草后换成结论 */
function CoreNode({ data }: NodeProps<Node<NodeData>>) {
  const { state, emphasis } = data
  const { endorses, challenges } = state.stats
  const total = endorses + challenges
  const R = 132, C = 2 * Math.PI * R
  const green = total ? (C * endorses) / total : 0
  const red = total ? (C * challenges) / total : 0
  const findings = state.findingOrder.map((f) => state.findings[f])
  const score = (f: (typeof findings)[number]) => f.reactions.filter((r) => r.kind === 'endorse').length - f.reactions.filter((r) => r.kind === 'challenge').length
  const leading = findings.filter((f) => f.role === 'primary').sort((x, y) => score(y) - score(x))[0]
  const conclusion = state.conclusion
  const approved = state.review?.decision === 'approve'

  let label: string, body: string, foot: ReactNode
  if (conclusion) {
    label = approved ? '结论已批准' : `会商结论 v${conclusion.version}`
    body = conclusion.conclusion.primary.cause.split(/[：:，,]/)[0]
    foot = (
      <span className="flex gap-1">
        {SPECIALISTS.map((s) => {
          const x = state.signoffs.find((o) => o.agentId === s)
          return <span key={s} className={`size-2.5 rounded-[2px] ${x ? (x.agree ? 'bg-[#d62e2e]' : 'bg-muted') : 'ring-1 ring-line-2'}`} />
        })}
      </span>
    )
  } else if (leading) {
    label = '当前主因'
    body = leading.brief
    foot = <>{AGENTS[leading.agentId].name}提出 · 赞同 {leading.reactions.filter((r) => r.kind === 'endorse').length} · 质疑 {leading.reactions.filter((r) => r.kind === 'challenge').length}</>
  } else {
    label = '会商议题'
    body = state.question ? (state.question.replace(/^.*?。/, '').replace(/请会商.*$/, '') || state.question).replace(/[，,。\s]+$/, '') : '等待开始'
    foot = state.status === 'running' ? '专家正在各自查数据' : ''
  }

  return (
    <motion.div animate={{ opacity: emphasis === 'dim' ? 0.25 : 1 }} className="relative flex size-[300px] items-center justify-center">
      <Anchors />
      <svg className="absolute inset-0" viewBox="0 0 300 300">
        <circle cx={150} cy={150} r={148} fill="none" stroke="#d3dce9" strokeWidth={1} />
        <motion.circle cx={150} cy={150} r={141} fill="none" stroke="#a3b0c4" strokeWidth={1} strokeDasharray="1 7" animate={{ rotate: 360 }} transition={{ duration: 90, repeat: Infinity, ease: 'linear' }} style={{ originX: '150px', originY: '150px' }} />
        <circle cx={150} cy={150} r={R} fill="none" stroke="#eef3f9" strokeWidth={8} />
        <g transform="rotate(-90 150 150)">
          <motion.circle cx={150} cy={150} r={R} fill="none" stroke="#10b981" strokeWidth={8} strokeLinecap="butt" animate={{ strokeDasharray: `${approved ? C : green} ${C}` }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
          <motion.circle cx={150} cy={150} r={R} fill="none" stroke="#ef4444" strokeWidth={8} animate={{ strokeDasharray: `${approved ? 0 : red} ${C}`, strokeDashoffset: -green }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} />
        </g>
      </svg>
      <div className="relative flex size-[236px] flex-col items-center justify-center rounded-full bg-white px-7 text-center shadow-[0_24px_60px_-24px_rgba(12,35,71,.35)]">
        <div className={`text-[12px] font-semibold ${conclusion ? 'text-brand' : 'text-muted'}`}>{label}</div>
        <AnimatePresence mode="wait">
          <motion.p key={body} initial={{ opacity: 0, y: 10, filter: 'blur(6px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }} transition={{ duration: 0.45 }} className="mt-2 line-clamp-4 text-[17px] leading-[1.45] font-bold text-ink">
            {body}
          </motion.p>
        </AnimatePresence>
        <div className="mt-2.5 text-[11px] text-muted">{foot}</div>
      </div>
    </motion.div>
  )
}

const nodeTypes = { specialist: SpecialistNode, coordinator: CoordinatorNode, human: HumanNode, core: CoreNode }
const edgeTypes = { net: NetEdgeView }

// ---------- 组合 ----------

function AutoFit() {
  const { fitView } = useReactFlow()
  const w = useStore((s) => s.width)
  const h = useStore((s) => s.height)
  useEffect(() => { void fitView({ padding: 0.06 }) }, [w, h, fitView])
  return null
}

export interface NetworkProps {
  state: ViewState
  focus?: string // 高亮的连线 key（群聊悬停或点选）
  focusAgent?: AgentId // 点选的 Agent：高亮它和与它相关的所有连线
  onPickPair: (key: string) => void
  onSelectAgent: (id: AgentId) => void
}

type Size = { width: number; height: number }

function NetworkInner({ state, focus, focusAgent, onPickPair, onSelectAgent }: NetworkProps) {
  // 节点每次渲染都会重建，需要把 React Flow 测得的尺寸带回去，否则节点会被当成未测量而隐藏
  const [measured, setMeasured] = useState<Record<string, Size>>({})
  const onNodesChange = (changes: NodeChange[]) => {
    const sized = changes.flatMap((c) => (c.type === 'dimensions' && c.dimensions ? [[c.id, c.dimensions] as const] : []))
    if (sized.length) setMeasured((m) => ({ ...m, ...Object.fromEntries(sized) }))
  }
  const now = state.now ?? 0
  const active = state.messages.filter((m) => now - m.ts < ACTIVE_MS)
  // 专家之间：每对一条线，按类型计数
  const edges: NetEdge[] = []
  const byPair = new Map<string, { counts: NetEdgeData['counts']; total: number; flights: Flight[] }>()
  for (const m of state.messages) {
    if (m.to === 'all') continue
    const key = edgeKey(m.from, m.to)
    const e = byPair.get(key) ?? { counts: {}, total: 0, flights: [] }
    e.counts[m.kind] = (e.counts[m.kind] ?? 0) + 1
    e.total++
    if (now - m.ts < ACTIVE_MS) e.flights.push({ id: m.id, from: m.from, color: KIND[m.kind].color })
    byPair.set(key, e)
  }
  for (const [key, e] of byPair) {
    const [a, b] = key.split('|') as [AgentId, AgentId]
    edges.push({ id: key, source: a, target: b, type: 'net', data: { kind: 'peer', a, b, ...e, emphasis: 'none', onPick: () => onPickPair(key) } })
  }

  // 问现场：提问方与现场之间的虚线，提问和回答各飞一次
  const human = new Map<AgentId, Flight[]>()
  for (const qid of state.questionOrder) {
    const q = state.questions[qid]
    const f = human.get(q.agentId) ?? []
    if (now - q.askedAt < ACTIVE_MS) f.push({ id: qid, from: q.agentId, color: HUMAN_COLOR })
    if (q.answer && now - q.answer.ts < ACTIVE_MS) f.push({ id: `${qid}a`, from: 'human', color: HUMAN_COLOR })
    human.set(q.agentId, f)
  }
  for (const [a, flights] of human) {
    edges.push({ id: `${a}|human`, source: a, target: 'human', type: 'net', data: { kind: 'human', a, b: 'human', counts: {}, total: 0, flights, emphasis: 'none', onPick: () => {} } })
  }

  // 专项会商期间：主持人与参会专家之间的流动虚线
  const session = state.sessions.findLast((s) => !s.closed)
  for (const p of session?.participants ?? []) {
    edges.push({ id: `coordinator|${p}`, source: 'coordinator', target: p, type: 'net', data: { kind: 'session', a: 'coordinator', b: p, counts: {}, total: 0, flights: [], emphasis: 'none', onPick: () => {} } })
  }

  // 高亮：连线优先（群聊悬停 / 点选连线），其次是点选的 Agent
  const pairIds = focus?.split('|') ?? []
  const touches = (e: NetEdge) => e.data!.a === focusAgent || e.data!.b === focusAgent
  for (const e of edges) e.data!.emphasis = focus ? (e.id === focus ? 'focus' : 'dim') : focusAgent ? (touches(e) ? 'focus' : 'dim') : 'none'
  const linked = new Set(edges.filter(touches).flatMap((e) => [e.data!.a, e.data!.b]))
  const nodeEmphasis = (id: AgentId): Emphasis =>
    focus ? (pairIds.includes(id) ? 'focus' : 'dim') : focusAgent ? (id === focusAgent ? 'focus' : linked.has(id) ? 'none' : 'dim') : 'none'

  const nodes: Node<NodeData>[] = [
    { id: 'core', type: 'core', position: { x: 0, y: 0 }, measured: measured.core, data: { id: 'coordinator', state, active, emphasis: focus || focusAgent ? 'dim' : 'none' } },
    ...(['coordinator', ...SPECIALISTS, 'human'] as AgentId[]).map((id) => ({
      id,
      type: id === 'coordinator' || id === 'human' ? id : 'specialist',
      position: POS[id],
      measured: measured[id],
      data: { id, state, active, emphasis: nodeEmphasis(id) },
    })),
  ]

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      nodeOrigin={[0.5, 0.5]}
      onNodesChange={onNodesChange}
      fitView
      fitViewOptions={{ padding: 0.06 }}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
      onEdgeClick={(_, e) => e.data?.kind === 'peer' && onPickPair(e.id)}
      onNodeClick={(_, n) => n.type !== 'core' && n.type !== 'human' && onSelectAgent(n.id as AgentId)}
    >
      <AutoFit />
    </ReactFlow>
  )
}

export function Network(props: NetworkProps) {
  return (
    <ReactFlowProvider>
      <NetworkInner {...props} />
    </ReactFlowProvider>
  )
}
