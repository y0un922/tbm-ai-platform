import { AGENTS, type Evidence } from '@tbm/shared'
import { X } from 'lucide-react'
import { motion } from 'motion/react'
import { ChartView } from './ChartView.tsx'

export function EvidenceDialog({ evidence, onClose }: { evidence: Evidence; onClose: () => void }) {
  const rows = evidence.rows ?? []
  const cols = rows[0] ? Object.keys(rows[0]) : []
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-[820px] overflow-y-auto rounded-2xl bg-white p-7 shadow-[0_40px_100px_-30px_rgba(12,35,71,.5)]"
      >
        <div className="flex items-center gap-3">
          <span className={`rounded-md px-2 py-1 font-mono text-[15px] font-bold ${evidence.kind === 'human' ? 'bg-[#e6f7fb] text-field' : 'bg-[#edf4ff] text-brand'}`}>{evidence.id}</span>
          <div>
            <div className="text-[20px] leading-none font-extrabold">{evidence.label}</div>
            <div className="mt-1.5 text-[12px] text-muted">来自 {AGENTS[evidence.owner].name}{evidence.kind === 'human' ? ' · 现场证据' : ' · 数据证据'}</div>
          </div>
          <button onClick={onClose} className="ml-auto rounded-full p-2 text-muted hover:bg-paper hover:text-ink"><X size={18} /></button>
        </div>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-2">{evidence.summary}</p>
        {evidence.chart && <div className="mt-4"><ChartView spec={evidence.chart} /></div>}
        {!evidence.chart && rows.length > 0 && (
          <table className="mt-4 w-full text-left font-mono text-[12px]">
            <thead className="text-muted"><tr>{cols.map((c) => <th key={c} className="px-2 py-1.5 font-normal">{c}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-line">{cols.map((c) => <td key={c} className="px-2 py-1.5">{r[c]}</td>)}</tr>)}</tbody>
          </table>
        )}
      </motion.div>
    </div>
  )
}
