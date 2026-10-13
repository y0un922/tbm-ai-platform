// 右栏：协作板（判断卡片，点开看反应和改口经过）和会商记录（群聊视图）
import { AGENTS, type AgentId } from '@tbm/shared'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import type { FindingView, MessageView, ViewState } from '../state/reducer.ts'
import { AGENT_ICON, KIND, REVISE_COLOR, ROLE } from './labels.ts'

const FLASH_MS = 2500

export function RefChip({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  // 判断编号 F* 不是证据，不可点开
  if (id.startsWith('F')) return <span className="font-mono text-[11px] text-slate-500">[{id}]</span>
  return (
    <button onClick={(e) => { e.stopPropagation(); onOpen(id) }} className="rounded bg-ink-600 px-1 font-mono text-[11px] text-sky-300 hover:bg-sky-500/30">
      {id}
    </button>
  )
}

export function Avatar({ id, size = 22 }: { id: AgentId; size?: number }) {
  const Icon = AGENT_ICON[id]
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full border" style={{ width: size, height: size, borderColor: AGENTS[id].color, background: `${AGENTS[id].color}22` }}>
      <Icon size={size * 0.6} color={AGENTS[id].color} />
    </span>
  )
}

function FindingCard({ f, now, onOpenRef }: { f: FindingView; now: number; onOpenRef: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const meta = AGENTS[f.agentId]
  const count = (k: string) => f.reactions.filter((r) => r.kind === k).length
  const first = f.revisions[0]?.before
  const fresh = now - f.updatedAt < FLASH_MS
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: f.role === 'ruled_out' ? 0.6 : 1, x: 0, boxShadow: fresh ? `0 0 0 2px ${meta.color}` : `0 0 0 0px ${meta.color}00` }}
      onClick={() => setOpen(!open)}
      className="cursor-pointer rounded-xl bg-ink-800 p-3"
    >
      <div className="flex items-center gap-2 text-sm">
        <Avatar id={f.agentId} />
        <span style={{ color: meta.color }}>{meta.name}</span>
        {first && first.role !== f.role && <span className={`rounded px-1.5 py-0.5 text-xs line-through opacity-60 ${ROLE[first.role].className}`}>{ROLE[first.role].label}</span>}
        <span className={`rounded px-1.5 py-0.5 text-xs ${ROLE[f.role].className}`}>{ROLE[f.role].label}</span>
        <ChevronDown size={16} className={`ml-auto text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
      </div>
      <p className={`mt-1.5 text-[16px] leading-snug font-medium text-white ${f.role === 'ruled_out' ? 'line-through decoration-slate-500' : ''}`}>{f.brief}</p>
      <div className="mt-2 flex items-center gap-3 font-mono text-sm">
        {count('challenge') > 0 && <span className="text-red-400">⚡ {count('challenge')}</span>}
        {count('endorse') > 0 && <span className="text-green-400">✓ {count('endorse')}</span>}
        {f.revisions.length > 0 && <span style={{ color: REVISE_COLOR }}>↻ {f.revisions.length}</span>}
        <div className="ml-auto flex w-28 items-center gap-1.5 text-xs text-slate-400">
          <div className="h-1.5 flex-1 overflow-hidden rounded bg-ink-600">
            <motion.div className="h-full" style={{ background: meta.color }} animate={{ width: `${f.confidence * 100}%` }} transition={{ duration: 0.8 }} />
          </div>
          {Math.round(f.confidence * 100)}%
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-2 space-y-1.5 overflow-hidden border-t border-ink-600 pt-2 text-sm">
            <li className="text-slate-400">{f.claim} {f.evidence.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}</li>
            {timeline(f).map((item) =>
              item.type === 'reaction' ? (
                <li key={item.m.id} className="text-slate-300">
                  <span style={{ color: KIND[item.m.kind].color }}>{KIND[item.m.kind].label}</span> · {AGENTS[item.m.from].name}：{item.m.brief}
                </li>
              ) : (
                <li key={`v${item.version}`} style={{ color: REVISE_COLOR }}>
                  <RotateCcw size={12} className="inline" /> 改口（{ROLE[item.before.role].label} {Math.round(item.before.confidence * 100)}% → {ROLE[item.after.role].label} {Math.round(item.after.confidence * 100)}%）：{item.reason}{' '}
                  {item.cites.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}
                </li>
              ),
            )}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** 反应和修正按时间合并成一条线 */
function timeline(f: FindingView) {
  return [
    ...f.reactions.map((m) => ({ type: 'reaction' as const, ts: m.ts, m })),
    ...f.revisions.map((r) => ({ type: 'revision' as const, ...r })),
  ].sort((a, b) => a.ts - b.ts)
}

function ChatItem({ m, onOpenRef }: { m: MessageView; onOpenRef: (id: string) => void }) {
  const k = KIND[m.kind]
  return (
    <motion.li initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2">
      <Avatar id={m.from} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-xs">
          <span style={{ color: AGENTS[m.from].color }}>{AGENTS[m.from].name}</span>
          <span style={{ color: k.color }}>{k.label}</span>
          <span className="text-slate-400">{m.to === 'all' ? '全体' : `@${AGENTS[m.to].name}`}</span>
        </div>
        <div className="mt-1 rounded-xl rounded-tl-sm border-l-2 bg-ink-800 px-3 py-2 text-sm text-slate-200" style={{ borderColor: k.color }}>
          {m.text}
          {m.refs.length > 0 && <span className="ml-1 inline-flex flex-wrap gap-1">{m.refs.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}</span>}
        </div>
      </div>
    </motion.li>
  )
}

export function Board({ state, onOpenRef }: { state: ViewState; onOpenRef: (id: string) => void }) {
  const [tab, setTab] = useState<'board' | 'chat'>('board')
  const now = state.now ?? 0
  return (
    <section className="flex min-h-0 flex-col border-l border-ink-600 bg-ink-900/70">
      <nav className="flex gap-1 border-b border-ink-600 p-2">
        {(['board', 'chat'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`flex-1 rounded-lg px-3 py-1.5 ${tab === t ? 'bg-ink-600 text-white' : 'text-slate-400'}`}>
            {t === 'board' ? `专家判断 ${state.findingOrder.length}` : `对话记录 ${state.messages.length}`}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'board' ? (
          <div className="space-y-2.5">
            {state.findingOrder.length === 0 && <p className="p-4 text-center text-slate-500">专家正在各自查数据，判断提出后出现在这里</p>}
            {state.findingOrder.map((id) => <FindingCard key={id} f={state.findings[id]} now={now} onOpenRef={onOpenRef} />)}
          </div>
        ) : (
          <ul className="space-y-3">
            {state.messages.map((m) => <ChatItem key={m.id} m={m} onOpenRef={onOpenRef} />)}
          </ul>
        )}
      </div>
    </section>
  )
}
