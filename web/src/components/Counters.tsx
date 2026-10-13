// 协作计数器：用数字直接回应"看不出协作"，每次增加时数字滚动
import type { CollabStats } from '@tbm/shared'
import { AnimatePresence, motion } from 'motion/react'
import type { ViewState } from '../state/reducer.ts'
import { HUMAN_COLOR, INK, KIND, REVISE_COLOR } from './labels.ts'

const ITEMS: { key: keyof CollabStats; label: string; color: string }[] = [
  { key: 'peerMessages', label: '专家对话', color: INK },
  { key: 'asks', label: '追问', color: KIND.ask.color },
  { key: 'challenges', label: '质疑', color: KIND.challenge.color },
  { key: 'endorses', label: '赞同', color: KIND.endorse.color },
  { key: 'revisions', label: '改口', color: REVISE_COLOR },
  { key: 'crossCitations', label: '跨专业引用', color: INK },
  { key: 'humanAsks', label: '问现场', color: HUMAN_COLOR },
]

function Num({ value, color }: { value: number; color: string }) {
  return (
    <span className="relative inline-flex h-7 overflow-hidden text-[24px] leading-7 font-extrabold tabular-nums" style={{ color }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '-100%' }} transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function Counters({ state }: { state: ViewState }) {
  return (
    <div className="flex shrink-0 border-t border-line">
      {ITEMS.map((c) => (
        <div key={c.key} className="flex flex-1 flex-col items-center border-r border-line py-2.5">
          <Num value={state.stats[c.key]} color={c.color} />
          <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
            <span className="size-1.5 rounded-full" style={{ background: c.color }} />
            {c.label}
          </span>
        </div>
      ))}
      <div className="flex flex-1 flex-col items-center py-2.5">
        <span className="text-[24px] leading-7 font-extrabold text-[#d62e2e] tabular-nums">
          {state.signoffs.filter((s) => s.agree).length}<span className="text-[14px] text-faint">/4</span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted"><span className="size-1.5 rounded-[1px] bg-[#d62e2e]" />会签</span>
      </div>
    </div>
  )
}
