// 立场矩阵（AI 协同主视图）：行是每条论点，列是四位专家。
// 一眼看出谁提出、谁赞同、谁质疑、质疑有没有化解、谁因为谁的证据改口——参考 MDTRoom（arXiv 2603.28393）的观点卡与冲突视图。
import { AGENTS, SPECIALISTS, type SpecialistId } from '@tbm/shared'
import { ArrowRight, Check, ChevronRight, RotateCcw, Users, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import type { FindingView, ViewState } from '../state/reducer.ts'
import { buildMatrix, persuaders, type Cell, type MatrixRow, type RowStatus } from '../state/stances.ts'
import { Badge, type Tone } from './kit.tsx'
import { KIND, REVISE_COLOR } from './labels.ts'
import { Avatar, KindChip, RefChip, RoleChip, agentName, clock } from './ui.tsx'

const STATUS: Record<RowStatus, { label: string; tone: Tone }> = {
  consensus: { label: '全员认可', tone: 'green' },
  disputed: { label: '存在分歧', tone: 'red' },
  settled: { label: '分歧已化解', tone: 'orange' },
  partial: { label: '部分认可', tone: 'blue' },
  pending: { label: '待回应', tone: 'gray' },
}

const GRID = 'grid grid-cols-[minmax(300px,1fr)_repeat(4,minmax(104px,128px))_118px]'

const short = (s: string, n = 6) => (s.length > n ? `${s.slice(0, n)}…` : s)

function Summary({ rows, state }: { rows: MatrixRow[]; state: ViewState }) {
  const n = (st: RowStatus) => rows.filter((r) => r.status === st).length
  const items: { label: string; value: number; color: string }[] = [
    { label: '论点', value: rows.length, color: '#0c2347' },
    { label: '全员认可', value: n('consensus'), color: '#05965f' },
    { label: '存在分歧', value: n('disputed'), color: '#ef4444' },
    { label: '分歧已化解', value: rows.filter((r) => r.status !== 'disputed' && r.f.reactions.some((m) => m.kind === 'challenge')).length, color: '#c87500' },
    { label: '改口', value: state.stats.revisions, color: REVISE_COLOR },
  ]
  return (
    <div className="flex shrink-0 items-center gap-6 border-b border-line px-4 py-2.5">
      {items.map((x) => (
        <span key={x.label} className="flex items-baseline gap-1.5">
          <span className="text-[22px] leading-none font-extrabold tabular-nums" style={{ color: x.color }}>{x.value}</span>
          <span className="text-[12px] text-muted">{x.label}</span>
        </span>
      ))}
      <span className="ml-auto flex items-center gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1"><Mark kind="endorse" />赞同</span>
        <span className="flex items-center gap-1"><Mark kind="challenge" />质疑</span>
        <span className="flex items-center gap-1"><Mark kind="resolved" />质疑后已修正</span>
        <span>点论点看来龙去脉</span>
      </span>
    </div>
  )
}

function Mark({ kind, big = false }: { kind: 'endorse' | 'challenge' | 'resolved' | 'stale'; big?: boolean }) {
  const size = big ? 22 : 14
  const cls = kind === 'endorse' ? 'bg-[#10b981] text-white' : kind === 'challenge' ? 'bg-[#ef4444] text-white' : kind === 'stale' ? 'bg-white text-[#10b981] ring-1 ring-[#10b981]/50' : 'bg-white text-[#ef4444] ring-1 ring-[#ef4444]/50'
  const Icon = kind === 'endorse' || kind === 'stale' ? Check : Zap
  return (
    <span className={`inline-grid shrink-0 place-items-center rounded-full ${cls}`} style={{ width: size, height: size }}>
      <Icon size={size * 0.62} strokeWidth={3} />
    </span>
  )
}

function StanceCell({ cell, f }: { cell: Cell; f: FindingView }) {
  if (!cell.stance) return <span className="text-[12px] text-faint">未表态</span>
  const history = cell.marks.slice(0, -1)
  const color = cell.stance === 'endorse' ? 'text-[#05965f]' : cell.stance === 'challenge' ? 'text-bad' : cell.stance === 'stale' ? 'text-muted' : 'text-[#c87500]'
  // 质疑后转赞同：中间提出者改过口 = 对方修正后认可；没改过 = 质疑者自己被说服
  const lastChallenge = history.findLast((m) => m.kind === 'challenge')
  const label = cell.stance === 'challenge' ? '质疑'
    : cell.stance === 'resolved' ? '已按质疑修正'
      : cell.stance === 'stale' ? '赞同旧版·待重表态'
      : !lastChallenge ? '赞同'
        : f.revisions.some((r) => r.ts > lastChallenge.ts && r.ts < cell.marks.at(-1)!.ts) ? '修正后赞同' : '被说服'
  return (
    <motion.span key={cell.marks.length} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 20 }} className="flex flex-col items-center gap-1">
      <span className="flex items-center gap-1" title={cell.marks.map((m) => `${KIND[m.kind].label}：${m.brief}`).join('\n')}>
        {history.map((m) => <span key={m.id} className="opacity-50"><Mark kind={m.kind === 'endorse' ? 'endorse' : 'challenge'} /></span>)}
        {history.length > 0 && <ArrowRight size={11} className="text-faint" />}
        <Mark big kind={cell.stance} />
      </span>
      <span className={`text-[12px] font-semibold ${color}`}>{label}</span>
    </motion.span>
  )
}

function Owner({ f }: { f: FindingView }) {
  return (
    <span className="flex flex-col items-center gap-1">
      <RoleChip role={f.role} />
      <span className="text-[11px] text-brand">提出者 · {Math.round(f.confidence * 100)}%</span>
    </span>
  )
}

function Row({ row, state, open, onToggle, onOpenRef }: { row: MatrixRow; state: ViewState; open: boolean; onToggle: () => void; onOpenRef: (id: string) => void }) {
  const { f } = row
  const st = STATUS[row.status]
  const first = f.revisions[0]?.before
  const live = state.sessions.some((x) => x.findingIds.includes(f.id) && !x.closed)
  const accent = row.status === 'disputed' ? '#ef4444' : row.status === 'consensus' ? '#10b981' : row.status === 'settled' ? '#f59e0b' : 'transparent'
  return (
    <motion.li layout="position" initial={{ opacity: 0, y: 10, backgroundColor: '#edf5ff' }} animate={{ opacity: 1, y: 0, backgroundColor: 'rgba(255,255,255,0)' }} transition={{ backgroundColor: { duration: 1.6 } }} className="border-b border-line">
      <button onClick={onToggle} className={`${GRID} relative w-full items-center text-left transition-colors hover:bg-paper-2 ${open ? 'bg-brand-soft/60' : ''}`}>
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-r" style={{ background: accent }} />
        <span className="flex min-w-0 flex-col gap-1.5 py-3 pr-3 pl-4">
          <span className="flex items-center gap-2 text-[12px] text-muted">
            <ChevronRight size={14} className={`shrink-0 transition ${open ? 'rotate-90 text-brand' : ''}`} />
            <span className="font-mono text-faint">{f.id}</span>
            <span className="font-semibold text-ink-2">{agentName(f.agentId)}专家</span>
            {first && first.role !== f.role && (
              <span className="flex items-center gap-1"><RoleChip role={first.role} struck /><ArrowRight size={11} /><RoleChip role={f.role} /></span>
            )}
            {f.revisions.length > 0 && <span className="flex items-center gap-0.5 font-semibold" style={{ color: REVISE_COLOR }}><RotateCcw size={11} strokeWidth={2.6} />改口 {f.revisions.length} 次</span>}
            {live && <Badge tone="blue" dot>专项会商中</Badge>}
          </span>
          <span className="line-clamp-2 pl-[22px] text-[15px] leading-snug font-bold text-ink">{f.brief}</span>
        </span>
        {SPECIALISTS.map((a) => (
          <span key={a} className={`flex h-full items-center justify-center border-l border-line px-1 ${a === f.agentId ? 'bg-brand-soft/50' : ''}`}>
            {a === f.agentId ? <Owner f={f} /> : <StanceCell cell={row.cells[a]!} f={f} />}
          </span>
        ))}
        <span className="flex h-full flex-col items-center justify-center gap-1 border-l border-line">
          <Badge tone={st.tone} dot>{st.label}</Badge>
          {row.status !== 'consensus' && <span className="text-[11px] text-muted">{row.endorsers}/3 赞同</span>}
          {row.verdict && <span className="flex items-center gap-1 text-[11px] text-muted">结论<RoleChip role={row.verdict} /></span>}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Story f={f} state={state} onOpenRef={onOpenRef} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  )
}

/** 论点的来龙去脉：提出 → 赞同 / 质疑 → 改口 → 专项会商 */
function Story({ f, state, onOpenRef }: { f: FindingView; state: ViewState; onOpenRef: (id: string) => void }) {
  const t = (ts: number) => clock(ts - (state.startedAt ?? ts))
  const items: { ts: number; node: ReactNode }[] = [
    {
      ts: f.postedAt,
      node: (
        <Step ts={t(f.postedAt)} who={f.agentId} tag={<span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-white">提出</span>}>
          <span className="flex items-center gap-1.5"><RoleChip role={f.revisions[0]?.before.role ?? f.role} />{f.revisions[0]?.before.brief ?? f.brief}</span>
        </Step>
      ),
    },
    ...f.reactions.map((m) => ({
      ts: m.ts,
      node: (
        <Step ts={t(m.ts)} who={m.from} tag={<KindChip kind={m.kind} />}>
          {m.brief}
          <span className="ml-1.5 inline-flex gap-1 align-middle">{m.refs.map((r) => <RefChip key={r} id={r} onOpen={onOpenRef} />)}</span>
        </Step>
      ),
    })),
    ...f.revisions.map((r) => {
      const by = persuaders(state, f.agentId, r.cites)
      return {
        ts: r.ts,
        node: (
          <Step ts={t(r.ts)} who={f.agentId} tag={<span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white" style={{ background: REVISE_COLOR }}><RotateCcw size={11} strokeWidth={2.6} />改口</span>}>
            <span className="flex flex-wrap items-center gap-1.5">
              <RoleChip role={r.before.role} />{Math.round(r.before.confidence * 100)}%<ArrowRight size={12} className="text-faint" /><RoleChip role={r.after.role} />{Math.round(r.after.confidence * 100)}%
              <span className="font-semibold">{r.after.brief}</span>
            </span>
            {by.length > 0 && <span className="mt-1 block font-semibold" style={{ color: REVISE_COLOR }}>因为{by.map((o) => agentName(o!)).join('、')}的证据（{r.cites.filter((c) => state.refOwners[c] !== f.agentId).join('、')}）</span>}
            <span className="mt-1 line-clamp-2 block text-[12px] text-muted">{r.reason}</span>
          </Step>
        ),
      }
    }),
    ...state.sessions.filter((x) => x.findingIds.includes(f.id)).flatMap((x) => [
      { ts: x.openedAt, node: <Step ts={t(x.openedAt)} who="coordinator" tag={<Badge tone="blue"><Users size={11} />召集专项会商</Badge>}>{x.topic}</Step> },
      ...(x.closed ? [{ ts: x.closed.ts, node: <Step ts={t(x.closed.ts)} who="coordinator" tag={<Badge tone="green"><Check size={11} />会商结束</Badge>}><span className="line-clamp-3">{x.closed.outcome}</span></Step> }] : []),
    ]),
  ]
  items.sort((a, b) => a.ts - b.ts)
  return (
    <div className="border-t border-dashed border-line bg-paper-2 py-3 pr-4 pl-10">
      <div className="mb-2 text-[12px] text-muted">
        <span className="font-semibold text-ink-2">{f.id} 现在的表述：</span>{f.claim}
      </div>
      <ol className="relative space-y-2 border-l-2 border-line-2 pl-4">{items.map((x, i) => <li key={i}>{x.node}</li>)}</ol>
    </div>
  )
}

function Step({ ts, who, tag, children }: { ts: string; who: SpecialistId | 'coordinator' | 'human'; tag: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex items-start gap-2 text-[13px] leading-relaxed text-ink-2">
      <span className="absolute top-2 -left-[21px] size-2 rounded-full bg-line-2 ring-2 ring-paper-2" />
      <span className="w-10 shrink-0 pt-px font-mono text-[11px] text-faint">{ts}</span>
      <Avatar id={who} size={20} />
      <span className="w-9 shrink-0 font-semibold text-ink">{short(AGENTS[who].name, 4)}</span>
      <span className="shrink-0">{tag}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}

export function StanceMatrix({ state, onOpenRef }: { state: ViewState; onOpenRef: (id: string) => void }) {
  const rows = useMemo(() => buildMatrix(state), [state])
  const [open, setOpen] = useState<string>()
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Summary rows={rows} state={state} />
      {/* 表头放进滚动容器并吸顶，和表体共用同一宽度，出现滚动条时列不会错位 */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={`${GRID} sticky top-0 z-10 border-b border-line bg-paper-2 text-[12px] font-semibold text-muted`}>
          <span className="py-2 pl-4">论点（谁提出 · 现在怎么定性）</span>
          {SPECIALISTS.map((a) => (
            <span key={a} className="flex items-center justify-center gap-1.5 border-l border-line py-2 text-ink-2"><Avatar id={a} size={20} />{AGENTS[a].name}</span>
          ))}
          <span className="flex items-center justify-center border-l border-line py-2">共识</span>
        </div>
        {rows.length === 0 ? (
          <div className="grid h-[calc(100%-37px)] place-items-center text-muted">
            {state.status === 'idle' ? '开始会商后，每位专家提出的论点会逐行出现在这里' : '专家正在背靠背查数据，尚未提出论点…'}
          </div>
        ) : (
          <ul>
            {rows.map((r) => <Row key={r.f.id} row={r} state={state} open={open === r.f.id} onToggle={() => setOpen(open === r.f.id ? undefined : r.f.id)} onOpenRef={onOpenRef} />)}
          </ul>
        )}
      </div>
    </div>
  )
}

