import type { RuntimeEvent } from '@/types'
import { str } from '@/utils/format'

export type TranscriptKind = 'user' | 'reasoning' | 'assistant' | 'tool' | 'subagent' | 'notice' | 'review'

export type ToolCard = {
  toolId: string
  name: string
  kind: string
  status: string
  argsText: string
  argsFull?: unknown
  resultText?: string
  resultFull?: unknown
  errorText?: string
  durationMs?: number
}

export type SubagentCard = {
  agentId: string
  name: string
  role: string
  task: string
  status: 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt?: string
  durationMs?: number
  toolCount: number
  currentTool?: string
  currentArgsPreview?: string
  outputLines: string[]
  summary?: string
  error?: string
}

export type ReviewCard = {
  reviewId: string
  status: string
  reason: string
  result: string
  risk: string
  missing: string[]
  recommendation: string
  supplement?: string
}

export type TranscriptRow = {
  id: string
  kind: TranscriptKind
  timestamp: string
  agentId?: string
  stageId?: string
  text?: string
  streaming?: boolean
  durationMs?: number
  tool?: ToolCard
  subagent?: SubagentCard
  review?: ReviewCard
}

export function clipLine(text: string, n = 88) {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= n ? flat : `${flat.slice(0, n - 1)}…`
}

function preview(value: unknown, n = 88) {
  if (value == null) return ''
  if (typeof value === 'string') return clipLine(value, n)
  try {
    return clipLine(JSON.stringify(value), n)
  } catch {
    return clipLine(String(value), n)
  }
}

function agentOf(event: RuntimeEvent) {
  return str(event.data, 'agentId', event.sourceId || '')
}

function isCoordinator(id: string) {
  return !id || id === 'coordinator'
}

function pushLine(card: SubagentCard, line: string) {
  const next = clipLine(line, 72)
  if (!next) return
  card.outputLines = [...card.outputLines, next].slice(-3)
}

function toolCard(event: RuntimeEvent): ToolCard {
  return {
    toolId: str(event.data, 'toolId', str(event.data, 'name', 'tool')),
    name: str(event.data, 'name', '调用'),
    kind: str(event.data, 'kind', 'tool'),
    status: str(event.data, 'status', 'completed'),
    argsText: preview(event.data.input),
    argsFull: event.data.input,
    resultText: preview(event.data.output, 160),
    resultFull: event.data.output,
    errorText: str(event.data, 'error') || undefined,
    durationMs: Number(event.data.durationMs) || undefined,
  }
}

function skipCoordinatorTool(name: string, toolId: string) {
  return toolId === 'delegate' || name.includes('委派') || toolId === 'request_review' || toolId === 'write_conclusion'
}

export function projectTranscript(events: RuntimeEvent[]): { main: TranscriptRow[]; byAgent: Record<string, TranscriptRow[]> } {
  const main: TranscriptRow[] = []
  const byAgent: Record<string, TranscriptRow[]> = {}
  const cards = new Map<string, TranscriptRow>()
  const open = new Set<string>()
  let hasUser = false

  const addAgent = (id: string, row: TranscriptRow) => {
    if (isCoordinator(id)) return
    byAgent[id] ??= []
    byAgent[id].push(row)
  }

  for (const event of events) {
    const agentId = agentOf(event)
    const stageId = str(event.data, 'stageId') || undefined

    if (event.type === 'trigger.fired' || event.type === 'run.started') {
      if (hasUser) continue
      const text = str(event.data, 'goal') || str(event.data, 'summary') || str(event.data, 'name')
      if (!text) continue
      hasUser = true
      main.push({ id: event.id, kind: 'user', timestamp: event.timestamp, text })
      continue
    }

    if (event.type === 'stage.started') {
      main.push({ id: event.id, kind: 'notice', timestamp: event.timestamp, stageId, text: str(event.data, 'name', '阶段') })
      continue
    }

    if (event.type === 'agent.started') {
      if (!isCoordinator(agentId)) open.add(agentId)
      else open.add('coordinator')
      continue
    }

    if (event.type === 'agent.delegated') {
      const id = str(event.data, 'agentId', event.targetId || '')
      if (!id || isCoordinator(id) || cards.has(id)) continue
      const card: SubagentCard = {
        agentId: id,
        name: str(event.data, 'name', id),
        role: str(event.data, 'role'),
        task: str(event.data, 'task'),
        status: 'running',
        startedAt: event.timestamp,
        toolCount: 0,
        outputLines: [],
      }
      const row: TranscriptRow = { id: `sub:${id}`, kind: 'subagent', timestamp: event.timestamp, agentId: id, stageId, subagent: card }
      cards.set(id, row)
      main.push(row)
      addAgent(id, { id: `${event.id}:task`, kind: 'user', timestamp: event.timestamp, agentId: id, text: card.task || card.role })
      continue
    }

    if (event.type === 'agent.thinking') {
      const text = str(event.data, 'text')
      const row: TranscriptRow = { id: event.id, kind: 'reasoning', timestamp: event.timestamp, agentId, stageId, text }
      if (isCoordinator(agentId)) main.push(row)
      else {
        const card = cards.get(agentId)?.subagent
        if (card) pushLine(card, text)
        addAgent(agentId, row)
      }
      continue
    }

    if (event.type === 'tool.called' || event.type === 'api.called' || event.type === 'mcp.called') {
      const tool = toolCard(event)
      const row: TranscriptRow = { id: event.id, kind: 'tool', timestamp: event.timestamp, agentId, stageId, tool, durationMs: tool.durationMs }
      if (isCoordinator(agentId)) {
        if (!skipCoordinatorTool(tool.name, tool.toolId)) main.push(row)
      } else {
        const card = cards.get(agentId)?.subagent
        if (card) {
          card.toolCount += 1
          card.currentTool = tool.name
          card.currentArgsPreview = tool.argsText || undefined
          pushLine(card, tool.name)
        }
        addAgent(agentId, row)
      }
      continue
    }

    if (event.type === 'agent.message') {
      const text = str(event.data, 'text')
      const row: TranscriptRow = { id: event.id, kind: 'assistant', timestamp: event.timestamp, agentId, stageId, text }
      if (isCoordinator(agentId)) main.push(row)
      else {
        const card = cards.get(agentId)?.subagent
        if (card && text) card.summary = clipLine(text, 96)
        addAgent(agentId, row)
      }
      continue
    }

    if (event.type === 'agent.completed' || event.type === 'agent.failed') {
      open.delete(isCoordinator(agentId) ? 'coordinator' : agentId)
      const card = cards.get(agentId)?.subagent
      if (card) {
        card.status = event.type === 'agent.failed' ? 'failed' : 'completed'
        card.completedAt = event.timestamp
        card.durationMs = Date.parse(event.timestamp) - Date.parse(card.startedAt)
        if (str(event.data, 'summary')) card.summary = clipLine(str(event.data, 'summary'), 96)
        if (str(event.data, 'error')) card.error = str(event.data, 'error')
      }
      continue
    }

    if (event.type === 'human_review.requested') {
      main.push({
        id: event.id,
        kind: 'review',
        timestamp: event.timestamp,
        stageId,
        review: {
          reviewId: str(event.data, 'reviewId', event.id),
          status: 'pending',
          reason: str(event.data, 'reason'),
          result: str(event.data, 'result'),
          risk: str(event.data, 'risk'),
          missing: Array.isArray(event.data.missing) ? event.data.missing.map(String) : [],
          recommendation: str(event.data, 'recommendation'),
          supplement: str(event.data, 'supplement') || undefined,
        },
      })
      continue
    }

    if (event.type === 'human_review.decided') {
      const reviewId = str(event.data, 'reviewId')
      const row = [...main].reverse().find((item) => item.kind === 'review' && item.review?.reviewId === reviewId)
      if (row?.review) row.review.status = str(event.data, 'decision', row.review.status)
      continue
    }

    if (event.type === 'run.completed' || event.type === 'run.failed') {
      open.clear()
      const text = str(event.data, 'summary') || str(event.data, 'error') || (event.type === 'run.completed' ? '运行完成' : '运行失败')
      main.push({ id: event.id, kind: event.type === 'run.failed' ? 'notice' : 'assistant', timestamp: event.timestamp, text })
    }
  }

  const markStream = (rows: TranscriptRow[]) => {
    for (const row of rows) {
      if (row.kind !== 'reasoning') continue
      const id = isCoordinator(row.agentId || '') ? 'coordinator' : row.agentId
      row.streaming = Boolean(id && open.has(id) && !rows.some((item) => item.kind === 'reasoning' && item.agentId === row.agentId && item.timestamp > row.timestamp))
    }
  }
  markStream(main)
  for (const rows of Object.values(byAgent)) markStream(rows)

  return { main, byAgent }
}
