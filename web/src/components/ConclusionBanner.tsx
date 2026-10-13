// 会商结论横幅：结论起草后固定在 AI 协同页顶部，一眼看到主因、次因、已排除和建议措施
import type { Cause } from '@tbm/shared'
import { ChevronDown, Flag, Stamp } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import type { ViewState } from '../state/reducer.ts'
import { Badge } from './kit.tsx'
import { RefChip, RoleChip } from './ui.tsx'

/** 原因的短标题：冒号前的部分，没有冒号就取第一个逗号前 */
export function causeTitle(cause: string) {
  const [head] = cause.split(/[：:]/)
  if (head.length < cause.length) return head.trim()
  return cause.split(/[，,；;。]/)[0].trim()
}
const causeBody = (cause: string) => cause.slice(causeTitle(cause).length).replace(/^[：:，,；;。\s]+/, '')

function Status({ state }: { state: ViewState }) {
  const agreed = state.signoffs.filter((s) => s.agree).length
  if (state.review) {
    const ok = state.review.decision === 'approve'
    return <Badge tone={ok ? 'green' : 'red'} dot>{ok ? '负责人已批准' : '负责人驳回'}</Badge>
  }
  if (state.stage === 'approval') return <Badge tone="orange" dot>待负责人审核</Badge>
  return <Badge tone="blue" dot>专家会签中 {agreed}/4</Badge>
}

function Group({ title, items, role }: { title: string; items: Cause[]; role: 'secondary' | 'ruled_out' }) {
  if (!items.length) return null
  return (
    <div>
      <div className="mb-1.5 text-[12px] font-semibold text-muted">{title}</div>
      <ul className="space-y-1">
        {items.map((c) => (
          <li key={c.cause} className="flex items-start gap-1.5 text-[13px] leading-snug" title={c.cause}>
            <RoleChip role={role} />
            <span className={role === 'ruled_out' ? 'text-muted' : 'font-semibold text-ink-2'}>{causeTitle(c.cause)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ConclusionBanner({ state, onOpenRef }: { state: ViewState; onOpenRef: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  if (!state.conclusion) return null
  const { version, conclusion: c } = state.conclusion
  const agreed = state.signoffs.filter((s) => s.agree).length
  return (
    <motion.section
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-2.5 shrink-0 overflow-hidden rounded-[10px] border border-[#f3c4c4] bg-white shadow-[0_1px_2px_rgba(17,39,77,.04)]"
    >
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)] divide-x divide-line">
        {/* 主因 */}
        <div className="relative bg-gradient-to-r from-[#fff5f5] to-white py-4 pr-5 pl-6">
          <span className="absolute inset-y-0 left-0 w-1 bg-bad" />
          <div className="flex items-center gap-2 text-[12px]">
            <Flag size={14} className="text-bad" strokeWidth={2.6} />
            <span className="font-bold text-bad">会商结论 v{version}</span>
            <Status state={state} />
            {agreed > 0 && <span className="flex items-center gap-1 text-muted"><Stamp size={12} />{agreed} 位专家会签</span>}
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="shrink-0 rounded-[6px] bg-bad px-2 py-1 text-[13px] font-bold text-white">主因</span>
            <h2 className="text-[22px] leading-tight font-extrabold text-ink">{causeTitle(c.primary.cause)}</h2>
          </div>
          <p className={`mt-1.5 text-[13px] leading-relaxed text-ink-2 ${open ? '' : 'line-clamp-2'}`}>{causeBody(c.primary.cause)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
            依据论点 <span className="font-mono">{c.primary.findings.join(' ')}</span> · 证据
            {c.primary.evidence.map((id) => <RefChip key={id} id={id} onOpen={onOpenRef} />)}
          </div>
        </div>
        {/* 次因 / 已排除 */}
        <div className="space-y-3 px-5 py-4">
          <Group title="次要因素" items={c.secondary} role="secondary" />
          <Group title="已排除" items={c.ruledOut} role="ruled_out" />
        </div>
        {/* 建议措施 */}
        <div className="px-5 py-4">
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold text-muted">
            建议措施（只给建议，不下发设备指令）
            <button onClick={() => setOpen(!open)} className="flex items-center gap-0.5 font-normal text-brand hover:underline">
              {open ? '收起' : '完整结论'}<ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <ol className="space-y-1.5">
            {c.actions.map((a, i) => (
              <li key={a} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-brand-soft text-[11px] font-bold text-brand">{i + 1}</span>
                <span className={open ? '' : 'line-clamp-1'}>{a}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-6 border-t border-line bg-paper-2 px-6 py-4 text-[13px] leading-relaxed text-ink-2">
          <div className="space-y-2">
            {[...c.secondary.map((x) => ['secondary', x] as const), ...c.ruledOut.map((x) => ['ruled_out', x] as const)].map(([role, x]) => (
              <p key={x.cause} className="flex items-start gap-1.5">
                <RoleChip role={role} />
                <span>{x.cause}<span className="ml-1 font-mono text-[11px] text-faint">{x.findings.join(' ')}</span></span>
              </p>
            ))}
          </div>
          {c.dataGaps.length > 0 && (
            <div>
              <div className="mb-1.5 font-semibold text-[#c87500]">数据缺口 · 未闭合项</div>
              <ul className="list-disc space-y-1 pl-4">{c.dataGaps.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}
        </div>
      )}
    </motion.section>
  )
}
