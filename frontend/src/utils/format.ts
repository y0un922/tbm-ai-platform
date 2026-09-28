export function formatTime(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function formatClock(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function formatRelative(iso?: string, now = Date.now()) {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const diff = now - t
  const min = Math.round(diff / 60000)
  if (Math.abs(min) < 1) return '刚刚'
  if (Math.abs(min) < 60) return min >= 0 ? `${min} 分钟前` : `${-min} 分钟后`
  const h = Math.round(min / 60)
  if (Math.abs(h) < 24) return h >= 0 ? `${h} 小时前` : `${-h} 小时后`
  const day = Math.round(h / 24)
  return day >= 0 ? `${day} 天前` : `${-day} 天后`
}

export function formatDuration(ms?: number) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—'
  if (ms < 1000) return '<1s'
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export function startOfToday(now = Date.now()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function str(data: Record<string, unknown> | undefined, key: string, fallback = '') {
  const v = data?.[key]
  return typeof v === 'string' ? v : fallback
}

export function num(data: Record<string, unknown> | undefined, key: string): number | undefined {
  const v = data?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

export function strList(data: Record<string, unknown> | undefined, key: string): string[] {
  const v = data?.[key]
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}
