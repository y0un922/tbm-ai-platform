import assert from 'node:assert/strict'
import type { RuntimeEvent } from '@/types'
import { projectTranscript } from './transcript.ts'

function ev(partial: Omit<RuntimeEvent, 'runId'>): RuntimeEvent {
  return { runId: 'run', ...partial }
}

const events: RuntimeEvent[] = [
  ev({ id: '1', type: 'run.started', timestamp: 't1', data: { goal: '分析 FIR' } }),
  ev({ id: '2', type: 'stage.started', timestamp: 't2', data: { stageId: 's1', name: '联合诊断' } }),
  ev({ id: '3', type: 'agent.delegated', timestamp: 't3', sourceId: 'coordinator', data: { agentId: 'c2', name: 'C2 掘进控制', task: '取环数据' } }),
  ev({ id: '4', type: 'tool.called', timestamp: 't4', sourceId: 'c2', data: { agentId: 'c2', name: '传感器数据', toolId: 'query_ring_metrics', kind: 'data_source' } }),
  ev({ id: '5', type: 'agent.message', timestamp: 't5', sourceId: 'c2', data: { agentId: 'c2', text: 'FIR 下降 31%' } }),
  ev({ id: '6', type: 'agent.completed', timestamp: 't6', sourceId: 'c2', data: { agentId: 'c2', summary: 'FIR 下降 31%' } }),
  ev({ id: '7', type: 'agent.message', timestamp: 't7', sourceId: 'coordinator', data: { agentId: 'coordinator', text: '主因交界' } }),
]

const { main, byAgent } = projectTranscript(events)
assert.equal(main[0]?.kind, 'user')
assert.equal(main.some((row) => row.kind === 'subagent' && row.agentId === 'c2'), true)
assert.equal(main.some((row) => row.kind === 'tool' && row.tool?.name === '传感器数据'), false)
assert.equal(main.some((row) => row.kind === 'assistant' && row.text === '主因交界'), true)
assert.equal(byAgent.c2?.some((row) => row.kind === 'tool'), true)
assert.equal(byAgent.c2?.[0]?.kind, 'user')
console.log('transcript ok')
