// 节点详情抽屉（二级视图）：流式思考、工具调用卡片、提交过的判断
import { AGENTS, type AgentId } from '@tbm/shared'
import { Brain, ChevronRight, Lock, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import type { ViewState } from '../state/reducer.ts'
import { ChartView } from './ChartView.tsx'
import { AGENT_ICON, STATUS } from './labels.ts'
import { Markdown } from './Markdown.tsx'
import { RefChip, RoleChip } from './ui.tsx'

const H3 = ({ children }: { children: ReactNode }) => <h3 className="mb-2 text-[14px] font-bold">{children}</h3>

/** 思考过程默认折叠，只露出字数 */
function Thinking({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-line bg-paper-2">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-1.5 px-3 py-2 text-[13px] text-muted hover:text-ink">
        <ChevronRight size={14} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        <Brain size={14} />
        思考过程
        <span className="ml-auto text-[12px] text-faint">{text.length} 字</span>
      </button>
      {open && <Markdown text={text} className="border-t border-line px-3 py-2.5 text-[13px] text-muted" />}
    </div>
  )
}

export function AgentDrawer({ id, state, onClose, onOpenRef }: { id: AgentId; state: ViewState; onClose: () => void; onOpenRef: (id: string) => void }) {
  const meta = AGENTS[id]
  const Icon = AGENT_ICON[id]
  const view = state.agents[id]
  const findings = state.findingOrder.map((f) => state.findings[f]).filter((f) => f.agentId === id)
  return (
    <motion.aside
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
      className="absolute inset-y-0 right-0 z-30 flex w-[560px] flex-col bg-white shadow-[-30px_0_80px_-30px_rgba(12,35,71,.35)]"
    >
      <header className="flex items-center gap-3 border-b border-line px-6 py-4">
        <span className="grid size-11 place-items-center rounded-full bg-[#edf4ff] text-[#1f72f0]"><Icon size={22} /></span>
        <div>
          <div className="text-[20px] leading-none font-extrabold">{meta.name}{id === 'coordinator' ? '' : '专家'}</div>
          <div className="mt-1.5 text-[13px] text-muted">{meta.role} · {view.detail ?? STATUS[view.status]}</div>
        </div>
        <button onClick={onClose} className="ml-auto rounded-full p-2 text-muted hover:bg-paper hover:text-ink"><X size={18} /></button>
      </header>
      <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-7 py-6 text-[14px]">
        {meta.dataDomain && (
          <p className="flex items-center gap-1.5 text-[13px] text-muted"><Lock size={13} /> 只能访问：{meta.dataDomain}</p>
        )}
        {findings.length > 0 && (
          <section>
            <H3>提交的判断</H3>
            <div className="space-y-2">
              {findings.map((f) => (
                <div key={f.id} className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2">
                  <span className="font-mono text-[11px] text-faint">{f.id}</span>
                  <RoleChip role={f.role} />
                  <span className="text-ink">{f.brief}</span>
                  {f.revisions.length > 0 && <span className="ml-auto shrink-0 text-[11px] text-warn">改过 {f.revisions.length} 次</span>}
                </div>
              ))}
            </div>
          </section>
        )}
        <section>
          <H3>查询数据 · {view.tools.length}</H3>
          <div className="space-y-2">
            {view.tools.map((t) => (
              <div key={t.callId} className="rounded-lg p-3 ring-1 ring-line">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium">{t.label}</span>
                  <span className="font-mono text-[11px] text-faint">{t.tool}</span>
                  {!t.result && <span className="ml-auto animate-pulse text-brand">执行中…</span>}
                  {t.result?.evidenceId && <span className="ml-auto"><RefChip id={t.result.evidenceId} onOpen={onOpenRef} /></span>}
                </div>
                {t.result && <p className={`mt-1 text-[13px] ${t.result.isError ? 'text-bad' : 'text-ink-2'}`}>{t.result.summary}</p>}
                {t.result?.chart && <ChartView spec={t.result.chart} compact />}
              </div>
            ))}
          </div>
        </section>
        <section>
          <H3>思考与输出</H3>
          <div className="space-y-2.5">
            {view.stream.map((s, i) => (s.kind === 'thinking' ? <Thinking key={i} text={s.text} /> : <Markdown key={i} text={s.text} className="text-ink" />))}
          </div>
        </section>
      </div>
    </motion.aside>
  )
}
