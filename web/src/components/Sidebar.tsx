import { Bot, House, Network, Wrench, Zap, type LucideIcon } from 'lucide-react'

export type Page = 'overview' | 'collab' | 'triggers' | 'agents' | 'tools'

export const NAV: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: '总览', icon: House },
  { id: 'collab', label: 'AI 协同', icon: Network },
  { id: 'triggers', label: '触发规则', icon: Zap },
  { id: 'agents', label: 'Agent 配置', icon: Bot },
  { id: 'tools', label: '工具与能力', icon: Wrench },
]

export function Sidebar({ page, running }: { page: Page; running: boolean }) {
  return (
    <nav className="flex w-[205px] shrink-0 flex-col border-r border-line bg-white">
      <div className="py-4">
        {NAV.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#/${id}`}
            className={`flex h-[54px] items-center gap-3.5 border-l-[3px] px-6 text-[15px] font-semibold ${page === id ? 'border-[#0f67eb] bg-[#eaf3ff] text-[#0f67eb]' : 'border-transparent text-[#14335e] hover:bg-[#f7faff]'}`}
          >
            <Icon size={20} strokeWidth={2} />
            {label}
            {id === 'collab' && running && <span className="ml-auto size-2 animate-pulse rounded-full bg-bad" title="会商进行中" />}
          </a>
        ))}
      </div>
      <div className="mt-auto p-[18px] text-[12px] text-[#6c7f9d]">
        <div className="mb-2 grid h-[110px] place-items-end overflow-hidden rounded-xl bg-gradient-to-b from-[#f7fbff] to-[#f2f7fd]">
          <div className="h-[62px] w-[120px] rounded-t-[80px] border-[10px] border-b-0 border-[#c9d8ea]" />
        </div>
        AI 与工程经验融合
        <br />
        为更好的隧道而来
        <div className="mt-[18px] text-[10px] text-[#8ea0b8]">Demo v0.2 · 多专家会商</div>
      </div>
    </nav>
  )
}
