// 浅色主题下各处共用的小部件
import { AGENTS, type AgentId, type FindingRole, type PeerMessage } from '@tbm/shared'
import { AGENT_ICON, HUMAN_COLOR, KIND, ROLE } from './labels.ts'

export function RefChip({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  // 判断编号 F* 不是证据，不可点开
  if (id.startsWith('F')) return <span className="font-mono text-[11px] text-faint">{id}</span>
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onOpen(id) }}
      className={`rounded px-1.5 py-px font-mono text-[11px] ring-1 transition hover:bg-brand hover:text-white hover:ring-brand ${id.startsWith('H') ? 'text-field ring-cyan-200' : 'text-brand ring-blue-200'}`}
    >
      {id}
    </button>
  )
}

export function Avatar({ id, size = 26 }: { id: AgentId; size?: number }) {
  const Icon = AGENT_ICON[id]
  const color = id === 'human' ? HUMAN_COLOR : id === 'coordinator' ? '#6d7d97' : '#0c2347'
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-white ring-1" style={{ width: size, height: size, color, ['--tw-ring-color' as string]: `${color}40` }}>
      <Icon size={size * 0.56} strokeWidth={1.8} />
    </span>
  )
}

export function KindChip({ kind, size = 'sm' }: { kind: PeerMessage['kind']; size?: 'sm' | 'lg' }) {
  const k = KIND[kind]
  const Icon = k.icon
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full font-semibold text-white ${size === 'lg' ? 'px-3 py-1 text-lg' : 'px-2 py-0.5 text-xs'}`} style={{ background: k.color }}>
      <Icon size={size === 'lg' ? 18 : 12} strokeWidth={2.6} />
      {k.label}
    </span>
  )
}

export function RoleChip({ role, struck = false }: { role: FindingRole; struck?: boolean }) {
  return <span className={`shrink-0 rounded px-1.5 py-px text-[11px] font-medium ${ROLE[role].className} ${struck ? 'line-through opacity-50' : ''}`}>{ROLE[role].label}</span>
}

export const agentName = (id: AgentId | 'all') => (id === 'all' ? '全体' : AGENTS[id].name)

/** 会签印章：朱红方印 */
export function Seal({ agree, size = 56 }: { agree: boolean; size?: number }) {
  const color = agree ? '#d62e2e' : '#6d7d97'
  return (
    <span
      className="flex items-center justify-center rounded-[6px] font-black leading-none"
      style={{ width: size, height: size, color, border: `${Math.max(2, size / 18)}px solid ${color}`, fontSize: size * 0.36, boxShadow: `inset 0 0 0 ${size / 28}px #fff, inset 0 0 0 ${size / 14}px ${color}` }}
    >
      {agree ? '会签' : '异议'}
    </span>
  )
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
