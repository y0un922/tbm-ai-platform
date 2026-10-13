// 会商群聊（主画面右栏）：所有专家间消息、判断、改口、问现场按时间排成一条线。
// 每条消息写明"谁 · 做什么 → 对谁"，引用被回应的判断或提问；悬停高亮网络里对应的连线，点选连线后只看这两人的对话。
import { AGENTS, STAGES, type AgentId } from '@tbm/shared'
import { ArrowRight, CircleHelp, FileText, Flag, Gavel, HardHat, RotateCcw, Users, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { edgeKey, type FeedEvent, type MessageView, type ViewState } from '../state/reducer.ts'
import { KIND, REVISE_COLOR, STAGE_HINT } from './labels.ts'
import { Avatar, KindChip, RefChip, RoleChip, Seal, agentName, clock } from './ui.tsx'

interface ChatProps {
  state: ViewState
  pair?: string
  onClearPair: () => void
  onHover: (key?: string) => void
  onOpenRef: (id: string) => void
}

const Name = ({ id }: { id: AgentId | 'all' }) => <span className="font-semibold text-ink">{agentName(id)}</span>

function Row({ children, accent, onEnter, onLeave }: { children: ReactNode; accent: string; onEnter?: () => void; onLeave?: () => void }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: 24, backgroundColor: '#edf5ff' }}
      animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(248,250,252,0)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 28, backgroundColor: { duration: 1.6 } }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className="group relative rounded-lg py-3 pr-3 pl-5 transition-colors hover:bg-paper-2"
    >
      <span className="absolute top-3.5 bottom-3.5 left-1.5 w-[3px] rounded-full" style={{ background: accent }} />
      {children}
    </motion.li>
  )
}

function Time({ state, ts }: { state: ViewState; ts: number }) {
  return <span className="ml-auto shrink-0 pl-2 font-mono text-[11px] text-faint">{clock(ts - (state.startedAt ?? ts))}</span>
}

function Message({ m, state, onHover, onOpenRef }: { m: MessageView; state: ViewState; onHover: ChatProps['onHover']; onOpenRef: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const k = KIND[m.kind]
  const finding = m.findingId ? state.findings[m.findingId] : undefined
  const asked = m.replyTo ? state.messages.find((x) => x.id === m.replyTo) : undefined
  return (
    <Row accent={k.color} onEnter={() => m.to !== 'all' && onHover(edgeKey(m.from, m.to))} onLeave={() => onHover(undefined)}>
      <div className="flex items-center gap-2 text-[14px]">
        <Avatar id={m.from} />
        <Name id={m.from} />
        <KindChip kind={m.kind} />
        <ArrowRight size={14} className="shrink-0 text-faint" />
        {m.to !== 'all' && <Avatar id={m.to} size={22} />}
        <Name id={m.to} />
        <Time state={state} ts={m.ts} />
      </div>
      {(finding || asked) && (
        <div className="mt-2 ml-[34px] flex items-start gap-1.5 border-l-2 border-line-2 pl-2.5 text-[13px] leading-snug text-muted">
          {finding ? (
            <><span className="shrink-0 font-mono text-[11px] leading-5">{finding.id}</span><span className="line-clamp-1"><span className="text-ink-2">{AGENTS[finding.agentId].name}</span>：{finding.brief}</span></>
          ) : asked && (
            <><CircleHelp size={13} className="mt-[3px] shrink-0" /><span className="line-clamp-1"><span className="text-ink-2">{AGENTS[asked.from].name}</span> 问：{asked.brief}</span></>
          )}
        </div>
      )}
      <p className="mt-1.5 ml-[34px] text-[16px] leading-snug font-semibold text-ink">{m.brief}</p>
      {open && <p className="mt-1.5 ml-[34px] text-[14px] leading-relaxed text-ink-2">{m.text}</p>}
      <div className="mt-2 ml-[34px] flex flex-wrap items-center gap-1.5">
        {m.refs.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}
        <button onClick={() => setOpen(!open)} className="ml-auto text-xs text-faint opacity-0 transition group-hover:opacity-100 hover:text-brand">{open ? '收起' : '展开全文'}</button>
      </div>
    </Row>
  )
}

function StageDivider({ e }: { e: Extract<FeedEvent, { type: 'stage.changed' }> }) {
  const i = STAGES.findIndex((s) => s.id === e.data.stage)
  const label = i >= 0 ? STAGES[i].label : '会商结束'
  return (
    <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2.5 px-2 pt-5 pb-2">
      <span className="shrink-0 rounded-[5px] bg-[#edf4ff] px-2 py-0.5 text-[12px] font-bold text-brand">{i >= 0 ? `第 ${i + 1} 步` : '结束'}</span>
      <span className="shrink-0 text-[15px] font-bold">{label}</span>
      {i >= 0 && <span className="truncate text-[12px] text-muted">{STAGE_HINT[e.data.stage]}</span>}
      <span className="h-px min-w-6 flex-1 bg-line" />
    </motion.li>
  )
}

function Item({ e, state, onHover, onOpenRef }: { e: FeedEvent; state: ViewState; onHover: ChatProps['onHover']; onOpenRef: (id: string) => void }) {
  switch (e.type) {
    case 'stage.changed':
      return <StageDivider e={e} />
    case 'peer.message':
      return <Message m={{ ...e.data, seq: e.seq, ts: e.ts }} state={state} onHover={onHover} onOpenRef={onOpenRef} />
    case 'finding.posted': {
      const f = e.data.finding
      return (
        <Row accent="#0c2347">
          <div className="flex items-center gap-2 text-[14px]">
            <Avatar id={f.agentId} />
            <Name id={f.agentId} />
            <span className="flex items-center gap-1 text-muted"><FileText size={13} /> 提出判断</span>
            <span className="font-mono text-[11px] text-faint">{f.id}</span>
            <RoleChip role={f.role} />
            <Time state={state} ts={e.ts} />
          </div>
          <p className="mt-1.5 ml-[34px] text-[16px] leading-snug font-medium text-ink">{f.brief}</p>
          <div className="mt-2 ml-[34px] flex items-center gap-2">
            <div className="h-1 w-28 overflow-hidden rounded-full bg-line">
              <motion.div className="h-full bg-ink" initial={{ width: 0 }} animate={{ width: `${f.confidence * 100}%` }} transition={{ duration: 0.8 }} />
            </div>
            <span className="font-mono text-[11px] text-muted">置信 {Math.round(f.confidence * 100)}%</span>
            <span className="ml-1 flex gap-1">{f.evidence.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}</span>
          </div>
        </Row>
      )
    }
    case 'finding.revised': {
      const d = e.data
      const by = [...new Set(d.cites.map((r) => state.refOwners[r]).filter((o): o is AgentId => !!o && o !== d.agentId))]
      return (
        <Row accent={REVISE_COLOR}>
          <div className="flex items-center gap-2 text-[14px]">
            <Avatar id={d.agentId} />
            <Name id={d.agentId} />
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold text-white" style={{ background: REVISE_COLOR }}><RotateCcw size={12} strokeWidth={2.6} />改口</span>
            <span className="font-mono text-[11px] text-faint">{d.findingId}</span>
            <RoleChip role={d.before.role} struck={d.before.role !== d.after.role} />
            {d.before.role !== d.after.role && <><ArrowRight size={12} className="text-faint" /><RoleChip role={d.after.role} /></>}
            <Time state={state} ts={e.ts} />
          </div>
          <p className="mt-1.5 ml-[34px] text-[16px] leading-snug font-medium text-ink">{d.after.brief}</p>
          {by.length > 0 && (
            <p className="mt-1.5 ml-[34px] text-[13px] text-ink-2">
              因为 {by.map((o, i) => <span key={o}>{i > 0 && '、'}<span className="font-semibold" style={{ color: REVISE_COLOR }}>{agentName(o)}</span></span>)} 的证据改变看法
            </p>
          )}
          <p className="mt-1 ml-[34px] line-clamp-2 text-[13px] leading-relaxed text-muted">{d.reason}</p>
          <div className="mt-1.5 ml-[34px] flex flex-wrap gap-1">{d.cites.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}</div>
        </Row>
      )
    }
    case 'human.asked':
      return (
        <Row accent="#0891b2">
          <div className="flex items-center gap-2 text-[14px]">
            <Avatar id={e.data.agentId} />
            <Name id={e.data.agentId} />
            <span className="inline-flex items-center gap-1 rounded-full bg-field px-2 py-0.5 text-xs font-semibold text-white"><HardHat size={12} />问现场</span>
            <Time state={state} ts={e.ts} />
          </div>
          <p className="mt-1.5 ml-[34px] text-[16px] leading-snug font-medium text-ink">{e.data.question}</p>
          <p className="mt-1 ml-[34px] text-[12px] text-muted">系统里缺少：{e.data.gap}</p>
        </Row>
      )
    case 'human.answered':
      return (
        <Row accent="#0891b2">
          <div className="flex items-center gap-2 text-[14px]">
            <Avatar id="human" />
            <span className="font-semibold text-field">现场</span>
            <span className="text-muted">回答</span>
            <Name id={state.questions[e.data.questionId]?.agentId ?? 'all'} />
            {'evidenceId' in e.data && <RefChip id={e.data.evidenceId} onOpen={onOpenRef} />}
            <Time state={state} ts={e.ts} />
          </div>
          <p className="mt-1.5 ml-[34px] text-[16px] leading-snug text-ink">{'text' in e.data ? e.data.text : '超时未回答，会商继续'}</p>
        </Row>
      )
    case 'session.opened':
      return (
        <Row accent="#136ff3">
          <div className="flex items-center gap-2 text-[14px]">
            <Avatar id="coordinator" />
            <Name id="coordinator" />
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white"><Users size={12} />召集专项会商</span>
            <span className="flex -space-x-1.5">{e.data.participants.map((p) => <Avatar key={p} id={p} size={22} />)}</span>
            <Time state={state} ts={e.ts} />
          </div>
          <p className="mt-1.5 ml-[34px] line-clamp-3 text-[15px] leading-snug text-ink">{e.data.topic}</p>
        </Row>
      )
    case 'conclusion.drafted':
      return (
        <Row accent="#136ff3">
          <div className="flex items-center gap-2 text-[14px]">
            <Avatar id="coordinator" />
            <Name id="coordinator" />
            <span className="flex items-center gap-1 text-brand"><Flag size={13} /> 起草结论 v{e.data.version}</span>
            <Time state={state} ts={e.ts} />
          </div>
          <p className="mt-2 ml-[34px] text-[17px] leading-snug font-bold text-ink">{e.data.conclusion.primary.cause}</p>
          <div className="mt-2 ml-[34px] flex flex-wrap gap-1">{e.data.conclusion.primary.findings.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}{e.data.conclusion.primary.evidence.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}</div>
        </Row>
      )
    case 'signoff.submitted':
      return (
        <Row accent={e.data.agree ? '#d62e2e' : '#6d7d97'}>
          <div className="flex items-start gap-3">
            <Seal agree={e.data.agree} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-[14px]"><Name id={e.data.agentId} /><span className="text-muted">{e.data.agree ? '签字同意' : '签字反对'} v{e.data.version}</span><Time state={state} ts={e.ts} /></div>
              {e.data.note && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-2">{e.data.note}</p>}
            </div>
          </div>
        </Row>
      )
    case 'review.decided':
      return (
        <Row accent="#136ff3">
          <div className="flex items-center gap-2 text-[14px]">
            <span className="flex size-[26px] items-center justify-center rounded-full bg-ink text-white"><Gavel size={14} /></span>
            <span className="font-semibold">负责人</span>
            <span className="text-brand">{e.data.decision === 'approve' ? '批准结论' : e.data.decision === 'reject' ? '驳回结论' : '要求补充'}</span>
            <Time state={state} ts={e.ts} />
          </div>
          {e.data.comment && <p className="mt-1.5 ml-[34px] text-[15px] text-ink">{e.data.comment}</p>}
        </Row>
      )
  }
}

export function Chat({ state, pair, onClearPair, onHover, onOpenRef }: ChatProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true) // 用户往上翻时不强行滚到底
  const pairIds = pair?.split('|') as [AgentId, AgentId] | undefined
  const items = pairIds
    ? state.feed.filter((e) => e.type === 'peer.message' && e.data.to !== 'all' && edgeKey(e.data.from, e.data.to) === pair)
    : state.feed

  useLayoutEffect(() => {
    const el = scroller.current
    // 瞬间跳到底：平滑滚动途中的 scroll 事件会被误判成用户上翻
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [items.length])
  useEffect(() => { stick.current = true }, [pair])

  return (
    <section className="relative flex min-h-0 flex-col overflow-hidden rounded-[10px] border border-line bg-white">
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
        <h2 className="text-[16px] font-bold">会商群聊</h2>
        <small className="text-[12px] text-muted">{state.messages.length} 条专家对话 · {state.findingOrder.length} 个判断</small>
        {pairIds && (
          <button onClick={onClearPair} className="ml-auto flex items-center gap-1.5 rounded-full bg-brand py-0.5 pr-2 pl-3 text-[12px] text-white">
            只看 {agentName(pairIds[0])} ⇄ {agentName(pairIds[1])} · {items.length}
            <X size={14} />
          </button>
        )}
      </header>
      <div
        ref={scroller}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160 }}
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-8"
      >
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted">
            <div className="flex -space-x-2">{(['geology', 'boring', 'cutter', 'muck'] as AgentId[]).map((id) => <Avatar key={id} id={id} size={40} />)}</div>
            <p className="text-[14px]">四位专家的每一句追问、质疑、赞同和改口<br />都会按时间出现在这里</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {items.map((e) => <Item key={e.seq} e={e} state={state} onHover={onHover} onOpenRef={onOpenRef} />)}
          </ul>
        )}
      </div>
    </section>
  )
}
