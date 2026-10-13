// 现场回答卡片（设计文档 2.5）：Agent 问现场时从画布底部升起
import { AGENTS } from '@tbm/shared'
import { HardHat, SendHorizontal } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { QuestionView } from '../state/reducer.ts'

export function HumanCard({ q, more, onAnswer }: { q: QuestionView; more: number; onAnswer: (questionId: string, text: string) => void }) {
  const [text, setText] = useState('')
  const submit = (t: string) => t.trim() && onAnswer(q.questionId, t.trim())
  return (
    <motion.div
      initial={{ y: 120, opacity: 0, rotate: 2 }}
      animate={{ y: 0, opacity: 1, rotate: 0 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      className="w-[620px] overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(12,35,71,.45)] ring-1 ring-line"
    >
      <div className="flex items-center gap-2 bg-field px-5 py-2.5 text-[13px] text-white">
        <HardHat size={16} />
        <span className="font-semibold">{AGENTS[q.agentId].name}</span> 在问现场
        <span className="text-white/75">· 系统里缺少：{q.gap}</span>
        {more > 0 && <span className="ml-auto rounded-full bg-white/20 px-2 text-xs">还有 {more} 个问题</span>}
      </div>
      <div className="p-5">
        <p className="text-[18px] leading-snug font-bold">{q.question}</p>
        {q.options && (
          <div className="mt-4 flex flex-wrap gap-2">
            {q.options.map((o) => (
              <button key={o} onClick={() => submit(o)} className="rounded-lg px-3 py-1.5 text-[14px] ring-1 ring-line-2 transition hover:bg-field hover:text-white hover:ring-field">{o}</button>
            ))}
          </div>
        )}
        <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(text) }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="输入现场情况…" className="flex-1 rounded-lg bg-paper px-3 py-2 text-[14px] ring-1 ring-line outline-none focus:ring-field" />
          <button className="flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-[14px] font-medium text-white"><SendHorizontal size={15} />回答</button>
        </form>
      </div>
    </motion.div>
  )
}
