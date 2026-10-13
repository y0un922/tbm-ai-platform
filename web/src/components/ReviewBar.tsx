// 人工审核栏（D7 第二屏的一部分，先放最小版本供联调 1 第 6 项使用）
import { motion } from 'motion/react'
import { useState } from 'react'

export function ReviewBar({ version, onReview }: { version: number; onReview: (version: number, decision: 'approve' | 'reject', comment?: string) => void }) {
  const [comment, setComment] = useState('')
  return (
    <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex w-[620px] items-center gap-2 rounded-2xl bg-white p-3 shadow-[0_30px_80px_-20px_rgba(12,35,71,.45)] ring-1 ring-line">
      <span className="pl-2 text-[13px] font-semibold whitespace-nowrap text-brand">人工审核 · 结论 v{version}</span>
      <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="审核意见（可选）" className="flex-1 rounded-lg bg-paper px-3 py-2 text-[14px] ring-1 ring-line outline-none focus:ring-brand" />
      <button onClick={() => onReview(version, 'approve', comment || undefined)} className="rounded-lg bg-brand px-4 py-2 text-[14px] font-semibold text-white">批准</button>
      <button onClick={() => onReview(version, 'reject', comment || undefined)} className="rounded-lg px-4 py-2 text-[14px] text-bad ring-1 ring-red-200">驳回</button>
    </motion.div>
  )
}
