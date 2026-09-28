import { useEffect, useMemo, useRef, useState } from 'react'
import type { RuntimeEvent } from '@/types'
import { Markdown } from '@/components/ui/Markdown'
import { formatDuration } from '@/utils/format'
import { cn } from '@/utils/cn'
import { clipLine, projectTranscript, type SubagentCard, type ToolCard, type TranscriptRow } from '@/features/runtime/transcript'

function pretty(value: unknown) {
  if (value == null || value === '') return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function thinkingPreview(text: string) {
  return text.split(/\n/).map((line) => line.trim()).filter(Boolean).slice(-3)
}

function Dot({ status }: { status: string }) {
  const tone = status === 'completed' || status === 'approved' ? 'bg-emerald-500' : status === 'failed' || status === 'rejected' ? 'bg-red-500' : 'bg-amber-400'
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full', tone)} />
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 text-[13px] text-black/30">❯</span>
      <p className="rounded-[16px] bg-black/[0.05] px-3.5 py-2 text-[15px] leading-[1.47] tracking-[-0.011em] text-neutral-900">{text}</p>
    </div>
  )
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1 text-[11px] text-black/35">●</span>
      <div className="min-w-0"><Markdown text={text} /></div>
    </div>
  )
}

function ReasoningRow({ row }: { row: TranscriptRow }) {
  const text = row.text ?? ''
  const lines = thinkingPreview(text)
  const [open, setOpen] = useState(false)
  return (
    <button type="button" onClick={() => setOpen((value) => !value)} className="block w-full rounded-xl px-1 py-1 text-left hover:bg-black/[0.03]">
      <div className="flex items-center gap-2 text-[13px] text-black/40">
        <span>{row.streaming ? '⠋' : '⚓'}</span>
        <span>思考{row.durationMs ? ` · ${formatDuration(row.durationMs)}` : row.streaming ? '…' : ''}</span>
      </div>
      {open ? (
        <div className="mt-1 pl-5 text-[13px] text-black/55"><Markdown className="text-[13px] text-black/55" text={text} /></div>
      ) : row.streaming ? (
        <div className="mt-1 space-y-0.5 pl-5 font-mono text-[12px] leading-relaxed text-black/35">
          {lines.map((line) => <p key={line} className="truncate">{clipLine(line, 72)}</p>)}
        </div>
      ) : null}
    </button>
  )
}

function ToolRow({ tool }: { tool: ToolCard }) {
  return (
    <details className="rounded-xl ring-1 ring-black/[0.06]">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px] [&::-webkit-details-marker]:hidden">
        <Dot status={tool.status} />
        <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">{tool.name}</span>
        <span className="shrink-0 tabular-nums text-[11px] text-black/35">{formatDuration(tool.durationMs)}</span>
      </summary>
      <div className="space-y-2 border-t border-black/[0.06] px-3 py-2">
        {pretty(tool.argsFull) && <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-black/45">{pretty(tool.argsFull)}</pre>}
        {pretty(tool.resultFull) && <pre className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-black/65">{pretty(tool.resultFull)}</pre>}
        {tool.errorText && <p className="text-[12px] text-red-600">{tool.errorText}</p>}
      </div>
    </details>
  )
}

function SubagentRow({ card, selected, onOpen }: { card: SubagentCard; selected: boolean; onOpen: () => void }) {
  const live = card.status === 'running'
  return (
    <button type="button" onClick={onOpen} className={cn('ml-6 w-[calc(100%-1.5rem)] rounded-[16px] bg-[#f5f5f7] px-3.5 py-2.5 text-left transition-[box-shadow] duration-150', selected && 'ring-2 ring-brand')}>
      <div className="flex items-center gap-2 text-[13px]">
        <Dot status={card.status} />
        <span className="min-w-0 flex-1 truncate font-medium text-neutral-900">{card.name}</span>
        <span className="shrink-0 tabular-nums text-[11px] text-black/35">
          {formatDuration(card.durationMs)}
          {card.toolCount ? ` · ${card.toolCount} tools` : ''}
        </span>
      </div>
      {live && card.currentTool && (
        <p className="mt-1 truncate pl-3.5 text-[12px] text-black/45">{card.currentTool}{card.currentArgsPreview ? ` · ${card.currentArgsPreview}` : ''}</p>
      )}
      {live && card.outputLines.length > 0 && (
        <div className="mt-1 space-y-0.5 pl-3.5 font-mono text-[12px] leading-relaxed text-black/35">
          {card.outputLines.map((line) => <p key={line} className="truncate">│ {line}</p>)}
        </div>
      )}
      {!live && (card.summary || card.error) && (
        <p className="mt-1 truncate pl-3.5 text-[12px] text-black/45">{card.error || card.summary}</p>
      )}
    </button>
  )
}

function ReviewRow({ row }: { row: TranscriptRow }) {
  const review = row.review
  if (!review) return null
  return (
    <div className="rounded-[16px] bg-amber-50 px-3.5 py-2.5">
      <div className="flex items-center gap-2 text-[13px] font-medium text-amber-950">
        <Dot status={review.status} />
        审核 · {review.status === 'pending' ? '待审' : review.status === 'approved' || review.status === 'approve' ? '已批准' : review.status === 'rejected' || review.status === 'reject' ? '已驳回' : '待补数'}
      </div>
      {review.result && <p className="mt-1 line-clamp-3 text-[13px] leading-relaxed text-amber-950/80">{review.result}</p>}
    </div>
  )
}

function RowView({ row, selected, onOpen }: { row: TranscriptRow; selected?: boolean; onOpen?: (id: string) => void }) {
  if (row.kind === 'user' && row.text) return <UserBubble text={row.text} />
  if (row.kind === 'assistant' && row.text) return <AssistantBubble text={row.text} />
  if (row.kind === 'reasoning') return <ReasoningRow row={row} />
  if (row.kind === 'tool' && row.tool) return <ToolRow tool={row.tool} />
  if (row.kind === 'subagent' && row.subagent) return <SubagentRow card={row.subagent} selected={Boolean(selected)} onOpen={() => onOpen?.(row.subagent!.agentId)} />
  if (row.kind === 'notice') {
    return (
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1 bg-black/[0.06]" />
        <span className="text-[11px] tracking-wide text-black/35">{row.text}</span>
        <span className="h-px flex-1 bg-black/[0.06]" />
      </div>
    )
  }
  if (row.kind === 'review') return <ReviewRow row={row} />
  return null
}

function Column({ rows, selectedId, onOpen, empty }: { rows: TranscriptRow[]; selectedId?: string; onOpen?: (id: string) => void; empty?: string }) {
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [rows.length, rows.at(-1)?.id])
  if (rows.length === 0) return <p className="px-4 py-8 text-sm text-black/35">{empty ?? '还没有内容。'}</p>
  return (
    <div className="space-y-3 px-4 py-4">
      {rows.map((row) => (
        <RowView key={row.id} row={row} selected={row.agentId === selectedId} onOpen={onOpen} />
      ))}
      <div ref={end} />
    </div>
  )
}

export function TranscriptView({ events }: { events: RuntimeEvent[] }) {
  const projected = useMemo(() => projectTranscript(events), [events])
  const [selectedId, setSelectedId] = useState<string>()
  const detail = selectedId ? projected.byAgent[selectedId] ?? [] : []
  const name = projected.main.find((row) => row.kind === 'subagent' && row.agentId === selectedId)?.subagent?.name
  return (
    <div className={cn('grid min-h-0 flex-1 overflow-hidden', selectedId ? 'lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]' : '')}>
      <div className="min-h-0 overflow-auto">
        <Column rows={projected.main} selectedId={selectedId} onOpen={(id) => setSelectedId(id === selectedId ? undefined : id)} empty="等待事件。" />
      </div>
      {selectedId && (
        <aside className="min-h-0 overflow-auto border-t border-black/[0.06] lg:border-t-0 lg:border-l">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="text-[13px] font-medium text-neutral-900">{name ?? selectedId}</h2>
            <button type="button" className="text-[12px] text-black/40" onClick={() => setSelectedId(undefined)}>关闭</button>
          </div>
          <Column rows={detail} empty="这个 Agent 还没有思考或工具记录。" />
        </aside>
      )}
    </div>
  )
}
