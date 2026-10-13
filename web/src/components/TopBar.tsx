import type { HealthResponse } from '@tbm/shared'
import { ChevronDown, Construction } from 'lucide-react'
import { useEffect, useState } from 'react'
import { source } from '../data/index.ts'

/** prototype 的隧道拱形标志 */
function Mark() {
  return (
    <span className="grid size-11 place-items-center rounded-xl border-2 border-[#6a8fca]">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="#315d9c" strokeWidth="2.6" strokeLinecap="round">
        <path d="M4 20V11a7 7 0 0 1 14 0v9" />
      </svg>
    </span>
  )
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])
  return now
}

export function TopBar() {
  const [health, setHealth] = useState<HealthResponse>()
  const now = useNow()
  useEffect(() => {
    source.health().then(setHealth, () => setHealth({ ok: false, model: '', error: '后端不可达' }))
  }, [])
  const local = source.kind === 'local'

  return (
    <header className="relative z-20 flex h-16 items-center gap-[22px] border-b border-line bg-white px-[22px]">
      <div className="flex min-w-[330px] items-center gap-3">
        <Mark />
        <div>
          <div className="text-[18px] font-extrabold tracking-[.3px]">盾构机 AI 多智能体协同平台</div>
          <div className="mt-0.5 text-[11px] text-[#8090a9]">让隧道施工更智能 · 更安全 · 更高效</div>
        </div>
      </div>
      <button className="flex items-center gap-2 rounded-lg border border-line bg-[#f8fbff] px-3.5 py-2.5 text-[#18375f]">
        <Construction size={15} />
        TBM-01 / 500–540 环
        <ChevronDown size={14} className="text-muted" />
      </button>
      <div className="flex-1" />
      {health && (
        <span className={`flex items-center gap-1.5 font-semibold ${local ? 'text-muted' : health.ok ? 'text-[#11a66b]' : 'text-bad'}`} title={health.error}>
          <span className={`size-2 rounded-full ${local ? 'bg-faint' : health.ok ? 'bg-[#11b878]' : 'bg-bad'}`} />
          {local ? '本地回放' : health.ok ? `在线 · ${health.model}` : '后端离线'}
        </span>
      )}
      <div className="border-l border-line pl-[18px] text-right text-[11px] text-[#5e7194]">
        {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        <small className="mt-1 block text-[#8fa0b7]">只给建议 · 不下发设备指令</small>
      </div>
    </header>
  )
}
