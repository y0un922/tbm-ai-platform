// 圆桌会议室（设计文档 3.3）：协调坐桌首，四位专家围坐，现场在桌尾；桌面中央是逐步形成的共识。
// 固定 1280×800 坐标系，整体按容器缩放。
import { AGENTS, SPECIALISTS, type AgentId } from '@tbm/shared'
import { Check, Lock } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { FeedEvent, ViewState } from '../state/reducer.ts'
import { AGENT_ICON, HUMAN_COLOR, KIND, ROLE, STATUS, narrate } from './labels.ts'

const W = 1280
const H = 800
const BUBBLE_MS = 5000 // 气泡停留时长（事件时钟）
const ARROW_MS = 3500 // 彩色箭头停留时长
const R = 46 // 头像半径

const TABLE = { cx: 640, cy: 420, rx: 330, ry: 185 }
const SEAT: Record<AgentId, { x: number; y: number }> = {
  coordinator: { x: 640, y: 120 },
  geology: { x: 185, y: 290 },
  cutter: { x: 1095, y: 290 },
  boring: { x: 185, y: 570 },
  muck: { x: 1095, y: 570 },
  human: { x: 640, y: 700 },
}
// 气泡放在头像哪一侧
const BUBBLE_SIDE: Record<AgentId, 'top' | 'right' | 'left'> = {
  coordinator: 'right', geology: 'top', cutter: 'top', boring: 'top', muck: 'top', human: 'right',
}

/** 按容器尺寸等比缩放固定画布 */
function useFit() {
  const ref = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  useLayoutEffect(() => {
    const el = ref.current!
    const ro = new ResizeObserver(() => setK(Math.min(el.clientWidth / W, el.clientHeight / H)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, k }
}

/** 两个座位之间的曲线：两端各让出头像半径，控制点背离桌子中心外弯，避开桌面中央 */
function curve(a: AgentId, b: AgentId) {
  const p = SEAT[a], q = SEAT[b]
  const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2
  let ox = mx - TABLE.cx, oy = my - TABLE.cy
  let bend = 0.35
  if (Math.hypot(ox, oy) < 40) {
    ox = -(q.y - p.y); oy = q.x - p.x; bend = 140 / Math.hypot(ox, oy)
  }
  const cx = mx + ox * bend, cy = my + oy * bend
  const trim = (from: { x: number; y: number }) => {
    const dx = cx - from.x, dy = cy - from.y, d = Math.hypot(dx, dy)
    return { x: from.x + (dx / d) * (R + 8), y: from.y + (dy / d) * (R + 8) }
  }
  const s = trim(p), t = trim(q)
  return `M ${s.x} ${s.y} Q ${cx} ${cy} ${t.x} ${t.y}`
}

// ---------- 座位 ----------

function Seat({ id, state, bubble, onSelect }: { id: AgentId; state: ViewState; bubble?: FeedEvent; onSelect: (id: AgentId) => void }) {
  const meta = AGENTS[id]
  const Icon = AGENT_ICON[id]
  const pos = SEAT[id]
  const isHuman = id === 'human'
  const view = state.agents[id]
  const pendingHuman = isHuman && state.questionOrder.some((q) => !state.questions[q].answer)
  const status = isHuman ? (pendingHuman ? 'waiting' : 'idle') : view.status
  const querying = status === 'tool'
  const signed = state.signoffs.find((x) => x.agentId === id)
  const inSession = state.sessions.some((s) => !s.closed && (s.participants as AgentId[]).includes(id))
  const dim = isHuman ? !pendingHuman && state.questionOrder.length === 0 : status === 'idle' && state.status === 'idle'

  return (
    <div className="absolute flex w-56 -translate-x-1/2 flex-col items-center" style={{ left: pos.x, top: pos.y - R }}>
      <div className={`relative ${isHuman ? '' : 'cursor-pointer'}`} style={{ width: R * 2, height: R * 2 }} onClick={() => !isHuman && onSelect(id)}>
        {/* 状态环 */}
        {(status === 'thinking' || status === 'tool') && (
          <div className="absolute -inset-2 animate-spin rounded-full border-[3px] border-dashed [animation-duration:6s]" style={{ borderColor: meta.color }} />
        )}
        {status === 'waiting' && <div className="absolute -inset-2 animate-pulse rounded-full border-[3px] border-dashed border-white" />}
        {inSession && <div className="absolute -inset-4 rounded-full border-2 border-cyan-300/70 shadow-[0_0_24px_#22d3ee88]" />}
        <motion.div
          animate={{ opacity: dim ? 0.45 : 1, boxShadow: status === 'thinking' || status === 'tool' || pendingHuman ? `0 0 36px ${meta.color}aa` : `0 0 0px ${meta.color}00` }}
          className="flex size-full items-center justify-center rounded-full border-2"
          style={{ borderColor: meta.color, background: `radial-gradient(circle at 35% 30%, ${meta.color}55, #0b111c 75%)` }}
        >
          <Icon size={40} color={isHuman ? HUMAN_COLOR : meta.color} strokeWidth={1.8} />
        </motion.div>
        {signed && (
          <motion.div initial={{ scale: 2.5, opacity: 0, rotate: -30 }} animate={{ scale: 1, opacity: 1, rotate: -12 }} className={`absolute -right-3 -bottom-1 rounded-md border-2 px-1.5 text-sm font-bold ${signed.agree ? 'border-red-400 text-red-400' : 'border-slate-400 text-slate-400'} bg-ink-950/90`}>
            {signed.agree ? '已签' : '反对'}
          </motion.div>
        )}
        {status === 'done' && !signed && (
          <div className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-ink-950"><Check size={16} strokeWidth={3} /></div>
        )}
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{meta.name}</div>
      <div className="text-sm text-slate-400">
        {isHuman ? (pendingHuman ? '等待回答…' : '施工人员') : status === 'idle' ? meta.role : (view.detail ?? STATUS[status])}
      </div>
      {meta.dataDomain && (
        <div className={`mt-1 flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition ${querying ? 'bg-white/10 text-white' : 'text-slate-500'}`} style={querying ? { boxShadow: `0 0 12px ${meta.color}88` } : undefined}>
          <Lock size={11} /> {meta.dataDomain}
        </div>
      )}
      <AnimatePresence>{bubble && <Bubble key={bubble.seq} e={bubble} state={state} side={BUBBLE_SIDE[id]} />}</AnimatePresence>
    </div>
  )
}

function Bubble({ e, state, side }: { e: FeedEvent; state: ViewState; side: 'top' | 'right' | 'left' }) {
  const n = narrate(e, state)
  const Icon = n.icon
  const place = side === 'top' ? 'bottom-full mb-3 left-1/2 -translate-x-1/2' : side === 'right' ? 'left-[calc(50%+70px)] top-2' : 'right-[calc(50%+70px)] top-2'
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`absolute z-10 w-64 rounded-2xl border-2 bg-ink-800/95 px-3 py-2 shadow-xl ${place}`}
      style={{ borderColor: n.color }}
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: n.color }}>
        <Icon size={16} strokeWidth={2.5} /> {n.verb}
        {n.target && n.target !== 'all' && <span className="text-slate-300">@{AGENTS[n.target].name}</span>}
      </div>
      {n.text && <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-slate-100">{n.text}</p>}
    </motion.div>
  )
}

// ---------- 桌面 ----------

function TableTop({ state }: { state: ViewState }) {
  const session = state.sessions.findLast((s) => !s.closed)
  const findings = state.findingOrder.map((id) => state.findings[id])
  const count = (f: (typeof findings)[number], kind: string) => f.reactions.filter((r) => r.kind === kind).length
  const live = findings
    .filter((f) => f.role !== 'ruled_out')
    .sort((a, b) => count(b, 'endorse') - count(a, 'endorse'))
    .slice(0, 4)
  const ruledOut = findings.filter((f) => f.role === 'ruled_out')

  return (
    <div className="absolute flex flex-col items-center justify-center text-center" style={{ left: TABLE.cx - TABLE.rx + 60, top: TABLE.cy - TABLE.ry + 30, width: (TABLE.rx - 60) * 2, height: (TABLE.ry - 30) * 2 }}>
      {session && (
        <div className="mb-2 rounded-full border border-cyan-300/60 bg-cyan-400/10 px-3 py-1 text-sm text-cyan-200">专项会商 · {session.topic.slice(0, 24)}</div>
      )}
      {state.conclusion ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <div className="text-sm tracking-[0.3em] text-cyan-300">会商结论</div>
          <p className="mt-2 line-clamp-3 text-xl leading-relaxed font-semibold text-white">{state.conclusion.conclusion.primary.cause.slice(0, 60)}</p>
          <div className="mt-3 text-sm text-slate-400">会签 {state.signoffs.filter((x) => x.agree).length} / 4</div>
        </motion.div>
      ) : findings.length === 0 ? (
        <>
          <div className="text-sm tracking-[0.3em] text-slate-500">会商议题</div>
          <p className="mt-2 text-2xl font-semibold text-slate-200">{state.title ? state.question.replace(/^.*?。/, '') || state.title : '等待开始'}</p>
        </>
      ) : (
        <div className="w-full space-y-2">
          <AnimatePresence>
            {live.map((f) => {
              const e = count(f, 'endorse'), c = count(f, 'challenge')
              return (
                <motion.div layout key={f.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-xl border bg-ink-900/80 px-3 py-1.5 text-left" style={{ borderColor: e > 0 ? `${AGENTS[f.agentId].color}aa` : '#26344c' }}>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${ROLE[f.role].className}`}>{ROLE[f.role].label}</span>
                  <span className="truncate text-[15px] text-slate-100">{f.brief}</span>
                  <span className="ml-auto flex shrink-0 gap-2 font-mono text-sm">
                    {e > 0 && <span className="text-green-400">✓{e}</span>}
                    {c > 0 && <span className="text-red-400">⚡{c}</span>}
                  </span>
                </motion.div>
              )
            })}
          </AnimatePresence>
          {ruledOut.length > 0 && <div className="text-xs text-slate-500">已排除 {ruledOut.length} 项：{ruledOut.map((f) => f.brief.slice(0, 8)).join('、')}</div>}
        </div>
      )}
    </div>
  )
}

// ---------- 连线 ----------

function Links({ state }: { state: ViewState }) {
  const now = state.now ?? 0
  const arrows: { id: string; a: AgentId; b: AgentId; color: string }[] = []
  for (const m of state.messages) {
    if (m.to !== 'all' && now - m.ts < ARROW_MS) arrows.push({ id: m.id, a: m.from, b: m.to, color: KIND[m.kind].color })
  }
  for (const qid of state.questionOrder) {
    const q = state.questions[qid]
    if (!q.answer || now - q.askedAt < ARROW_MS) arrows.push({ id: qid, a: q.agentId, b: 'human', color: HUMAN_COLOR })
    if (q.answer && !('timeout' in q.answer) && now - q.answer.ts < ARROW_MS) arrows.push({ id: `${qid}a`, a: 'human', b: q.agentId, color: HUMAN_COLOR })
  }
  const colors = [...new Set(arrows.map((x) => x.color))]
  const marker = (c: string) => `arrow-${c.slice(1)}`

  return (
    <svg className="absolute inset-0" width={W} height={H}>
      <defs>
        <radialGradient id="table" cx="50%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#1d2b42" />
          <stop offset="100%" stopColor="#0c1424" />
        </radialGradient>
        <filter id="glow"><feGaussianBlur stdDeviation="4" /></filter>
        {colors.map((c) => (
          <marker key={c} id={marker(c)} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
      </defs>
      {/* 桌子 */}
      <ellipse cx={TABLE.cx} cy={TABLE.cy + 14} rx={TABLE.rx} ry={TABLE.ry} fill="#000" opacity={0.5} filter="url(#glow)" />
      <ellipse cx={TABLE.cx} cy={TABLE.cy} rx={TABLE.rx} ry={TABLE.ry} fill="url(#table)" stroke="#22d3ee" strokeOpacity={0.35} strokeWidth={2} />
      <ellipse cx={TABLE.cx} cy={TABLE.cy} rx={TABLE.rx - 18} ry={TABLE.ry - 14} fill="none" stroke="#22d3ee" strokeOpacity={0.12} />
      {/* 已有的交流：越多越粗，最后织成一张网 */}
      {Object.values(state.edges).map((e) => (
        <motion.path key={e.key} d={curve(e.a, e.b)} fill="none" stroke="#94a3b8" strokeOpacity={0.22} strokeWidth={1 + Math.min(e.count, 10) * 0.6} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8 }} />
      ))}
      {/* 正在发生的交流：彩色箭头 + 飞行光点 */}
      {arrows.map((x) => {
        const d = curve(x.a, x.b)
        return (
          <g key={x.id}>
            <path d={d} fill="none" stroke={x.color} strokeWidth={8} strokeOpacity={0.25} filter="url(#glow)" />
            <motion.path d={d} fill="none" stroke={x.color} strokeWidth={3.5} markerEnd={`url(#${marker(x.color)})`} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
            <circle r={6} fill={x.color}>
              <animateMotion dur="0.9s" repeatCount="indefinite" path={d} />
            </circle>
          </g>
        )
      })}
    </svg>
  )
}

// ---------- 组合 ----------

export function RoundTable({ state, onSelect }: { state: ViewState; onSelect: (id: AgentId) => void }) {
  const { ref, k } = useFit()
  const now = state.now ?? 0
  // 每个人最近一次发言（BUBBLE_MS 内）
  const bubbles: Partial<Record<AgentId, FeedEvent>> = {}
  for (const e of state.feed) {
    // 审核人不在桌边，不冒气泡
    if (e.type === 'stage.changed' || e.type === 'review.decided' || now - e.ts > BUBBLE_MS) continue
    bubbles[narrate(e, state).actor] = e
  }
  return (
    <div ref={ref} className="relative h-full w-full overflow-hidden">
      <div className="absolute top-1/2 left-1/2" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${k})` }}>
        <Links state={state} />
        <TableTop state={state} />
        {(['coordinator', ...SPECIALISTS, 'human'] as AgentId[]).map((id) => (
          <Seat key={id} id={id} state={state} bubble={bubbles[id]} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}
