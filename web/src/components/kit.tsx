// prototype 风格的页面骨架：页头、卡片、KPI、徽标、标签页
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export function PageHead({ title, desc, actions, children }: { title: string; desc: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-3 rounded-[10px] border border-line bg-white px-5 py-[18px] shadow-[0_1px_2px_rgba(17,39,77,.04)]">
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0">
          <h1 className="mb-1.5 text-[23px] font-bold">{title}</h1>
          <p className="truncate text-muted">{desc}</p>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2.5">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`min-w-0 rounded-[10px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(17,39,77,.04)] ${className}`}>{children}</div>
}

export function CardTitle({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <span className="text-[17px] font-bold whitespace-nowrap">{children}</span>
        {sub && <small className="truncate text-[12px] text-muted">{sub}</small>}
      </div>
      {right}
    </div>
  )
}

const TONE = {
  blue: 'bg-[#edf4ff] text-[#1470f4]',
  green: 'bg-[#e8f8f1] text-[#05965f]',
  orange: 'bg-[#fff7e8] text-[#f59e0b]',
  red: 'bg-[#fff0f0] text-[#ef4444]',
  gray: 'bg-[#eef1f5] text-[#7a889e]',
  violet: 'bg-[#f0ebff] text-[#7551d7]',
  cyan: 'bg-[#e6f7fb] text-[#0891b2]',
}
export type Tone = keyof typeof TONE

export function Kpi({ icon: Icon, label, value, unit, sub, tone = 'blue' }: { icon: LucideIcon; label: string; value: ReactNode; unit?: string; sub?: ReactNode; tone?: Tone }) {
  return (
    <div className="flex min-h-[94px] items-center gap-3.5 rounded-[9px] border border-line bg-white px-[18px] py-[17px]">
      <span className={`grid size-12 shrink-0 place-items-center rounded-full ${TONE[tone]}`}><Icon size={22} strokeWidth={2} /></span>
      <div className="min-w-0">
        <div className="font-semibold text-[#5f7395]">{label}</div>
        <div className="my-0.5 text-[26px] leading-tight font-extrabold tabular-nums">
          {value}
          {unit && <small className="ml-1 text-[13px] font-bold">{unit}</small>}
        </div>
        {sub && <div className="truncate text-[12px] text-[#7f8ea7]">{sub}</div>}
      </div>
    </div>
  )
}

const BADGE = {
  blue: 'bg-[#edf4ff] text-[#2a6ecd]',
  green: 'bg-[#e8f8f1] text-[#05965f]',
  orange: 'bg-[#fff0db] text-[#c87500]',
  red: 'bg-[#ffe6e6] text-[#d83838]',
  gray: 'bg-[#eef1f5] text-[#7a889e]',
  violet: 'bg-[#f0ebff] text-[#7551d7]',
  cyan: 'bg-[#e6f7fb] text-[#0e7490]',
}
export function Badge({ children, tone = 'blue', dot = false }: { children: ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-[5px] px-[7px] py-[3px] text-[11px] font-medium whitespace-nowrap ${BADGE[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="mt-2 mb-3 flex overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-2.5 whitespace-nowrap ${value === t.id ? 'border-[#0d68ef] font-bold text-[#0d68ef]' : 'border-transparent text-[#5d7191] hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Btn({ children, primary, onClick, disabled, icon: Icon }: { children: ReactNode; primary?: boolean; onClick?: () => void; disabled?: boolean; icon?: LucideIcon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-[7px] border px-4 py-2.5 font-bold whitespace-nowrap transition disabled:opacity-40 ${primary ? 'border-brand bg-brand text-white hover:brightness-110' : 'border-line bg-white text-[#244266] hover:bg-paper'}`}
    >
      {Icon && <Icon size={15} strokeWidth={2.4} />}
      {children}
    </button>
  )
}

export const selectCls = 'rounded-[7px] border border-line bg-white px-3 py-2.5 text-[#46607f] outline-none focus:border-brand'
export const inputCls = 'w-full rounded-[6px] border border-[#dbe4ef] bg-white px-2.5 py-2 text-[#314b6f] outline-none focus:border-brand'
