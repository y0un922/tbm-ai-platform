import type { RuntimeEvent, TriggerInstance } from '@/types'
import { reduceGraph } from '@/features/runtime/graphReducer'
import { growOrigin } from '@/features/runtime/grow'
import { NODE_H, layoutGraph } from '@/features/runtime/layoutGraph'
import { diagnosisScript } from '@/mocks/script'

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg)
}

function ev(partial: Omit<RuntimeEvent, 'runId' | 'data'> & { data?: Record<string, unknown> }): RuntimeEvent {
  return { runId: 'run', data: {}, ...partial }
}

const events: RuntimeEvent[] = [
  ev({ id: '1', type: 'trigger.fired', timestamp: '2026-09-22T12:31:42.000Z', data: { instanceId: 'ti1', name: 'FIR 连续下降', triggerType: 'metric_threshold', source: 'SCADA', rule: '连续 5 环下降 > 20%', actual: '31%', threshold: '20%' } }),
  ev({ id: '2', type: 'coordinator.started', timestamp: '2026-09-22T12:31:43.000Z', data: { name: 'Coordinator' } }),
  ev({ id: '3', type: 'agent.delegated', timestamp: '2026-09-22T12:31:44.000Z', sourceId: 'coordinator', data: { agentId: 'c2', name: 'C2 掘进控制' } }),
  ev({ id: '4', type: 'agent.delegated', timestamp: '2026-09-22T12:31:45.000Z', sourceId: 'coordinator', data: { agentId: 'c6', name: 'C6 渣土评估' } }),
  ev({ id: '5', type: 'tool.called', timestamp: '2026-09-22T12:31:46.000Z', sourceId: 'c6', data: { agentId: 'c6', name: 'Foam API', kind: 'api' } }),
  ev({ id: '6', type: 'tool.called', timestamp: '2026-09-22T12:31:47.000Z', sourceId: 'c6', data: { agentId: 'c6', name: 'Foam API', kind: 'api' } }),
  ev({ id: '6b', type: 'agent.delegated', timestamp: '2026-09-22T12:31:47.500Z', sourceId: 'coordinator', data: { agentId: 'c1', name: 'C1 地质建模' } }),
  ev({ id: '7', type: 'agent.spawned', timestamp: '2026-09-22T12:31:48.000Z', sourceId: 'c1', data: { agentId: 'c1_sub', parentId: 'c1', name: 'Geological Sub-Agent' } }),
  ev({ id: '8', type: 'human_review.requested', timestamp: '2026-09-22T12:31:49.000Z', sourceId: 'coordinator', data: { reviewId: 'rv1', reason: '超出自动执行范围' } }),
]

const agg = reduceGraph(events, { mode: 'aggregated', now: Date.parse('2026-09-22T12:32:00.000Z') })
assert(agg.nodes.find((n) => n.kind === 'trigger')?.name === 'FIR 连续下降', 'trigger name')
assert(agg.edges.some((e) => e.kind === 'trigger' && e.target === 'coordinator'), 'trigger edge')
assert(agg.edges.some((e) => e.kind === 'delegate' && e.target === 'agent:c2'), 'delegate edge')
const foam = agg.nodes.find((n) => n.name === 'Foam API')
assert(foam?.kind === 'api', 'api kind')
assert(foam?.count === 2, 'aggregated count')
assert(agg.nodes.filter((n) => n.name === 'Foam API').length === 1, 'merged tool')
assert(agg.edges.some((e) => e.kind === 'spawn' && e.target === 'agent:c1_sub'), 'spawn edge')
assert(agg.nodes.find((n) => n.kind === 'human_review')?.status === 'review', 'review status')

const exp = reduceGraph(events, { mode: 'expanded', now: Date.parse('2026-09-22T12:32:00.000Z') })
assert(exp.nodes.filter((n) => n.name === 'Foam API').length === 2, 'expanded calls')
assert(exp.nodes.some((n) => n.id.endsWith(':resume') && n.name === 'C6 渣土评估'), 'resume node')
assert(exp.edges.some((e) => e.kind === 'result'), 'result edge')

const again = reduceGraph(events, { mode: 'aggregated', now: Date.parse('2026-09-22T12:32:00.000Z') })
assert(again.nodes.map((n) => n.id).join() === agg.nodes.map((n) => n.id).join(), 'stable nodes')
assert(again.edges.map((e) => e.id).join() === agg.edges.map((e) => e.id).join(), 'stable edges')

const decided = reduceGraph(events, { mode: 'aggregated', now: Date.parse('2026-09-22T12:32:00.000Z'), reviewDecisions: { rv1: 'approve' } })
assert(decided.nodes.find((n) => n.kind === 'human_review')?.status === 'completed', 'approved review')

const trigger: TriggerInstance = {
  id: 'ti_demo',
  type: 'metric_threshold',
  name: 'FIR 连续下降',
  source: 'SCADA',
  summary: 'FIR 连续第五环下降',
  timestamp: '2026-09-22T12:31:42.000Z',
  payload: { rule: '连续 5 环下降 > 20%', actual: '31%', threshold: '20%' },
}
const demo = diagnosisScript(trigger, 'rv_demo').map((step, i) => ({
  id: `d${i}`,
  runId: 'run',
  type: step.type,
  timestamp: new Date(Date.parse('2026-09-22T12:31:42.000Z') + step.offsetMs).toISOString(),
  sourceId: step.sourceId,
  targetId: step.targetId,
  data: step.data,
}))
const demoGraph = reduceGraph(demo, { mode: 'aggregated', now: Date.parse('2026-09-22T12:32:00.000Z') })
for (const name of ['FIR 连续下降', 'Coordinator', 'C2 掘进控制', 'C6 渣土评估', 'Foam API', 'C1 地质建模', 'Geological Sub-Agent', '参数建议审核']) {
  assert(demoGraph.nodes.some((n) => n.name === name), `missing ${name}`)
}
const pos = await layoutGraph(demoGraph.nodes, demoGraph.edges)
assert(pos.size === demoGraph.nodes.length, 'layout coverage')

const placed = new Map([['c1', { x: 10, y: 20 }]])
const spawned = growOrigin('sub', placed, new Map([['sub', { x: 80, y: 200 }]]), [
  { id: 'e', source: 'c1', target: 'sub', kind: 'spawn', label: 'Spawn' },
])
assert(spawned?.x === 10 && spawned.y === 20 + NODE_H, 'spawn grows from parent, not origin')
assert(growOrigin('root', new Map(), new Map([['root', { x: 0, y: 0 }]]), []) === null, 'root has no outside origin')

console.log('graphReducer ok')
