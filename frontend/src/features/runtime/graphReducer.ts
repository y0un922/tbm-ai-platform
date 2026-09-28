import type {
  GraphEdgeKind,
  GraphEdgeModel,
  GraphMode,
  GraphNodeKind,
  GraphNodeModel,
  NodeStatus,
  ReviewDecision,
  RuntimeEvent,
} from '@/types'
import { EDGE_LABEL, NODE_KIND_LABEL } from '@/features/runtime/labels'
import { num, str, strList } from '@/utils/format'

export interface ReduceOptions {
  mode: GraphMode
  now?: number
  reviewDecisions?: Record<string, ReviewDecision>
}

const AGENT_KIND: Record<string, GraphNodeKind> = {
  coordinator: 'coordinator',
}

function callVisual(event: RuntimeEvent): { kind: GraphNodeKind; edge: GraphEdgeKind } {
  const hint = str(event.data, 'kind')
  if (hint === 'api' || event.type === 'api.called') return { kind: 'api', edge: 'api_call' }
  if (hint === 'mcp' || event.type === 'mcp.called') return { kind: 'mcp', edge: 'mcp_call' }
  if (hint === 'data_source') return { kind: 'data_source', edge: 'data' }
  if (hint === 'tool' || event.type === 'tool.called') return { kind: 'tool', edge: 'tool_call' }
  return { kind: 'tool', edge: 'tool_call' }
}

function statusOf(value: string | undefined, fallback: NodeStatus): NodeStatus {
  if (value === 'pending' || value === 'running' || value === 'completed' || value === 'failed' || value === 'waiting' || value === 'review') {
    return value
  }
  return fallback
}

function duration(node: GraphNodeModel, now: number) {
  if (node.startedAt && node.endedAt) {
    node.durationMs = new Date(node.endedAt).getTime() - new Date(node.startedAt).getTime()
    return
  }
  const given = num(node.detail, 'durationMs')
  if (given != null && node.status !== 'running') {
    node.durationMs = given
    return
  }
  if (node.startedAt && (node.status === 'running' || node.status === 'review' || node.status === 'waiting')) {
    node.durationMs = Math.max(0, now - new Date(node.startedAt).getTime())
  }
}

export function reduceGraph(events: RuntimeEvent[], options: ReduceOptions) {
  const mode = options.mode
  const now = options.now ?? Date.now()
  const nodes = new Map<string, GraphNodeModel>()
  const edges = new Map<string, GraphEdgeModel>()
  const latest = new Map<string, string>()

  // Preserve stream order for same-millisecond decisions and resumed stages.
  const ordered = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const decidedReviewIds = new Set<string>()

  function put(node: GraphNodeModel, actorId?: string) {
    nodes.set(node.id, node)
    if (actorId) latest.set(actorId, node.id)
  }

  function open(actorId: string) {
    const id = latest.get(actorId)
    return id ? nodes.get(id) : undefined
  }

  function create(id: string, actorId: string, kind: GraphNodeKind, name: string, status: NodeStatus, event: RuntimeEvent, detail: Record<string, unknown>) {
    const prev = nodes.get(id)
    if (prev && mode === 'aggregated') {
      prev.count += 1
      prev.endedAt = status === 'pending' || status === 'running' || status === 'review' ? undefined : event.timestamp
      prev.detail = { ...prev.detail, ...detail }
      if (status) prev.status = status
      latest.set(actorId, prev.id)
      return prev
    }
    const node: GraphNodeModel = {
      id,
      kind,
      name,
      typeLabel: NODE_KIND_LABEL[kind],
      status,
      startedAt: event.timestamp,
      count: 1,
      actorId,
      detail,
    }
    put(node, actorId)
    return node
  }

  function link(sourceId: string | undefined, targetId: string, kind: GraphEdgeKind, eventId: string) {
    if (!sourceId || sourceId === targetId || !nodes.has(sourceId) || !nodes.has(targetId)) return
    const id = mode === 'aggregated' ? `${kind}:${sourceId}:${targetId}` : `${kind}:${eventId}:${sourceId}:${targetId}`
    if (edges.has(id)) return
    edges.set(id, { id, source: sourceId, target: targetId, kind, label: EDGE_LABEL[kind] })
  }

  function agentActor(agentId: string) {
    return agentId === 'coordinator' ? 'coordinator' : `agent:${agentId}`
  }

  for (const event of ordered) {
    const data = event.data
    if (event.type === 'trigger.fired') {
      const instanceId = str(data, 'instanceId', event.targetId || event.id)
      const actorId = `trigger:${instanceId}`
      const id = mode === 'aggregated' ? actorId : `evt:${event.id}`
      create(id, actorId, 'trigger', str(data, 'name', 'Trigger'), 'completed', event, {
        ...data,
        instanceId,
        endedAt: event.timestamp,
      })
      const node = nodes.get(latest.get(actorId)!)
      if (node) node.endedAt = event.timestamp
      latest.set('trigger', latest.get(actorId)!)
      continue
    }

    if (event.type === 'coordinator.started') {
      const actorId = 'coordinator'
      const id = mode === 'aggregated' ? actorId : `evt:${event.id}`
      const node = create(id, actorId, 'coordinator', str(data, 'name', 'Coordinator'), 'running', event, data)
      link(latest.get('trigger'), node.id, 'trigger', event.id)
      continue
    }

    if (event.type === 'stage.started') {
      const node = open('coordinator')
      if (node && node.status !== 'failed') {
        node.status = 'running'
        node.endedAt = undefined
        node.detail = { ...node.detail, stageId: data.stageId, stageName: data.name }
      }
      continue
    }

    if (event.type === 'agent.delegated' || event.type === 'agent.spawned') {
      const agentId = str(data, 'agentId', event.targetId || event.id)
      const actorId = agentActor(agentId)
      const kind: GraphNodeKind = event.type === 'agent.spawned' ? 'sub_agent' : agentId === 'coordinator' ? 'coordinator' : 'agent'
      const id = mode === 'aggregated' ? actorId : `evt:${event.id}`
      const node = create(id, actorId, kind, str(data, 'name', agentId), 'pending', event, data)
      const parent = event.type === 'agent.spawned'
        ? latest.get(agentActor(str(data, 'parentId', event.sourceId || '')))
        : latest.get(agentActor(event.sourceId || 'coordinator'))
      link(parent, node.id, event.type === 'agent.spawned' ? 'spawn' : 'delegate', event.id)
      continue
    }

    if (event.type === 'agent.started' || event.type === 'agent.completed' || event.type === 'agent.failed') {
      const agentId = str(data, 'agentId', event.targetId || '')
      const node = open(agentActor(agentId))
      if (!node) continue
      if (event.type === 'agent.started') {
        node.status = 'running'
        node.endedAt = undefined
        node.startedAt ??= event.timestamp
      } else if (event.type === 'agent.completed') {
        node.status = 'completed'
        node.endedAt = event.timestamp
        if (str(data, 'summary')) node.detail.summary = str(data, 'summary')
      } else {
        node.status = 'failed'
        node.endedAt = event.timestamp
        node.detail.error = str(data, 'error', '失败')
      }
      continue
    }

    if (event.type === 'tool.called' || event.type === 'api.called' || event.type === 'mcp.called') {
      const caller = str(data, 'agentId', event.sourceId || '')
      if (caller === 'coordinator') continue
      const visual = callVisual(event)
      const name = str(data, 'name', '调用')
      const aggregated = mode === 'aggregated'
      const actorId = aggregated ? `${visual.kind}:${caller}:${name}` : `call:${event.id}`
      const id = aggregated ? actorId : `evt:${event.id}`
      const status = statusOf(str(data, 'status'), 'completed')
      const node = create(id, actorId, visual.kind, name, status, event, data)
      if (status === 'completed' || status === 'failed') node.endedAt = event.timestamp
      if (num(data, 'durationMs') != null) node.detail.durationMs = num(data, 'durationMs')
      link(latest.get(agentActor(caller)), node.id, visual.edge, event.id)
      if (!aggregated) {
        const callerNode = open(agentActor(caller))
        if (callerNode && callerNode.id !== node.id) {
          const previous = callerNode
          previous.status = previous.status === 'failed' ? 'failed' : 'completed'
          previous.endedAt ??= event.timestamp
          const resume = create(`evt:${event.id}:resume`, agentActor(caller), previous.kind === 'coordinator' ? 'coordinator' : previous.kind === 'sub_agent' ? 'sub_agent' : AGENT_KIND[caller] ?? 'agent', previous.name, 'running', event, { agentId: caller, resumed: true })
          link(node.id, resume.id, 'result', event.id)
        }
      }
      continue
    }

    if (event.type === 'agent.message') {
      const from = latest.get(agentActor(str(data, 'agentId', event.sourceId || '')))
      const toActor = str(data, 'to', event.targetId || '')
      const to = toActor ? latest.get(agentActor(toActor)) : undefined
      const text = str(data, 'text')
      if (from) {
        const node = nodes.get(from)
        if (node && text) {
          const prev = strList(node.detail, 'messages')
          node.detail.messages = [...prev, text]
        }
      }
      if (from && to) link(from, to, 'message', event.id)
      continue
    }

    if (event.type === 'human_review.requested') {
      const reviewId = str(data, 'reviewId', event.id)
      const actorId = `review:${reviewId}`
      const id = mode === 'aggregated' ? actorId : `evt:${event.id}`
      const node = create(id, actorId, 'human_review', str(data, 'name', '人工审核'), 'review', event, { ...data, decision: undefined })
      const coordinator = open('coordinator')
      if (coordinator) {
        coordinator.status = 'review'
        coordinator.endedAt = undefined
      }
      const source = latest.get(agentActor(event.sourceId || str(data, 'agentId', 'coordinator')))
      link(source ?? latest.get('coordinator'), node.id, 'review', event.id)
      continue
    }

    if (event.type === 'human_review.decided') {
      const reviewId = str(data, 'reviewId')
      const decision = str(data, 'decision')
      if (decision !== 'approve' && decision !== 'reject' && decision !== 'request_more_data') continue
      decidedReviewIds.add(reviewId)
      const review = open(`review:${reviewId}`)
      if (review) {
        review.status = decision === 'approve' ? 'completed' : decision === 'reject' ? 'failed' : 'waiting'
        review.detail.decision = decision
        review.endedAt = decision === 'request_more_data' ? undefined : event.timestamp
      }
      const coordinator = open('coordinator')
      if (coordinator) coordinator.status = decision === 'approve' ? 'running' : decision === 'reject' ? 'failed' : 'waiting'
      continue
    }

    if (event.type === 'run.completed' || event.type === 'run.failed') {
      // Historical scripts predate human_review.decided.
      for (const review of nodes.values()) {
        if (review.kind === 'human_review' && review.status === 'review') {
          review.status = event.type === 'run.completed' ? 'completed' : 'failed'
          review.endedAt = event.timestamp
        }
      }
      const node = open('coordinator')
      if (!node) continue
      node.status = event.type === 'run.completed' ? 'completed' : 'failed'
      node.endedAt = event.timestamp
      if (str(data, 'summary')) node.detail.summary = str(data, 'summary')
      if (str(data, 'error')) node.detail.error = str(data, 'error')
    }
  }

  const decisions = options.reviewDecisions ?? {}
  for (const node of nodes.values()) {
    if (node.kind === 'human_review') {
      const reviewId = str(node.detail, 'reviewId')
      const decision = decidedReviewIds.has(reviewId) ? undefined : decisions[reviewId]
      if (decision === 'approve') node.status = 'completed'
      if (decision === 'reject') node.status = 'failed'
      if (decision === 'request_more_data') node.status = 'waiting'
      if (decision) node.detail.decision = decision
    }
    duration(node, now)
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => (a.startedAt ?? '').localeCompare(b.startedAt ?? '') || a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
  }
}
