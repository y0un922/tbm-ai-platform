import { Maximize2, Pause, Play, ZoomIn, ZoomOut } from 'lucide-react'
import type { GraphMode } from '@/types'
import { Button, IconButton } from '@/components/ui/primitives'
import { cn } from '@/utils/cn'

export type GraphFilter = 'all' | 'agents' | 'calls' | 'review'

export function RuntimeGraphToolbar({
  mode,
  onMode,
  filter,
  onFilter,
  onZoomIn,
  onZoomOut,
  onFit,
  onReplay,
  replaying,
  onLive,
  speed,
  onSpeed,
}: {
  mode: GraphMode
  onMode: (mode: GraphMode) => void
  filter: GraphFilter
  onFilter: (filter: GraphFilter) => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onReplay: () => void
  replaying: boolean
  onLive: () => void
  speed: number
  onSpeed: (speed: number) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-3 py-2">
      <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="group" aria-label="拓扑模式">
        {([['aggregated', '聚合'], ['expanded', '展开']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={mode === id} className={cn('rounded-md px-2.5 py-1 text-xs font-medium', mode === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')} onClick={() => onMode(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="inline-flex rounded-lg bg-gray-100 p-0.5" role="group" aria-label="节点过滤">
        {([['all', '全部'], ['agents', 'Agent'], ['calls', '调用'], ['review', '审核']] as const).map(([id, label]) => (
          <button key={id} type="button" aria-pressed={filter === id} className={cn('rounded-md px-2 py-1 text-xs font-medium', filter === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500')} onClick={() => onFilter(id)}>
            {label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <label className="flex items-center gap-1 text-[11px] text-gray-500">
          回放
          <select className="rounded-md border border-gray-200 bg-white px-1 py-1 text-xs" value={speed} onChange={(e) => onSpeed(Number(e.target.value))} aria-label="回放速度">
            <option value={1}>1x</option>
            <option value={4}>4x</option>
            <option value={8}>8x</option>
            <option value={20}>20x</option>
          </select>
        </label>
        <Button variant="secondary" className="h-8 px-2" onClick={onReplay}>
          <Play className="size-3.5" aria-hidden />
          回放
        </Button>
        {replaying && (
          <Button variant="ghost" className="h-8 px-2" onClick={onLive}>
            <Pause className="size-3.5" aria-hidden />
            回到实时
          </Button>
        )}
        <IconButton label="缩小" onClick={onZoomOut}><ZoomOut className="size-4" /></IconButton>
        <IconButton label="放大" onClick={onZoomIn}><ZoomIn className="size-4" /></IconButton>
        <IconButton label="适配视图" onClick={onFit}><Maximize2 className="size-4" /></IconButton>
      </div>
    </div>
  )
}
