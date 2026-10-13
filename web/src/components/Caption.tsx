// 实时解说条：一句话说清现在谁对谁做了什么
import { STAGES } from '@tbm/shared'
import { ArrowRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { FeedEvent, ViewState } from '../state/reducer.ts'
import { STAGE_HINT, narrate } from './labels.ts'
import { agentName } from './ui.tsx'

function Line({ e, state }: { e: FeedEvent; state: ViewState }) {
  const n = narrate(e, state)
  const Icon = n.icon
  if (e.type === 'stage.changed') {
    const i = STAGES.findIndex((s) => s.id === e.data.stage)
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="font-bold text-brand">{i >= 0 ? `第 ${i + 1} 步 · ${STAGES[i].label}` : '会商结束'}</span>
        <span className="truncate text-muted">{i >= 0 ? STAGE_HINT[e.data.stage] : `${n.text || '结论待审核'} · ${state.signoffs.filter((s) => s.agree).length} 位专家会签`}</span>
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-[16px] font-bold">{n.actorName ?? agentName(n.actor)}</span>
      <motion.span
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 18 }}
        className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-semibold text-white"
        style={{ background: n.color }}
      >
        <Icon size={13} strokeWidth={2.6} />
        {n.verb}
      </motion.span>
      {n.target && (
        <>
          <ArrowRight size={15} className="shrink-0 text-faint" />
          <span className="shrink-0 text-[16px] font-bold text-ink-2">{n.target === 'human' ? '现场' : agentName(n.target)}</span>
        </>
      )}
      {n.text && <span className="truncate pl-1 text-ink-2">{n.text}</span>}
    </span>
  )
}

export function Caption({ state }: { state: ViewState }) {
  const e = state.feed.at(-1)
  return (
    <div className="flex h-11 items-center gap-3 border-b border-line px-4">
      <span className={`flex shrink-0 items-center gap-1.5 rounded-[5px] px-2 py-0.5 text-[11px] font-bold ${state.status === 'running' ? 'bg-[#fff0f0] text-bad' : 'bg-[#eef1f5] text-[#7a889e]'}`}>
        {state.status === 'running' && <span className="size-1.5 animate-pulse rounded-full bg-bad" />}
        {state.status === 'running' ? '实时' : state.status === 'idle' ? '待开始' : '已结束'}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={e?.seq ?? 0} className="min-w-0 flex-1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
          {e ? <Line e={e} state={state} /> : <span className="text-muted">四位专家各握一份别人看不到的数据。开始会商后，看他们如何互相追问、质疑、改口，最终达成共识。</span>}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
