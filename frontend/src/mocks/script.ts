import type { RuntimeEventType, TriggerInstance } from '@/types'

export interface ScriptStep {
  offsetMs: number
  type: RuntimeEventType
  sourceId?: string
  targetId?: string
  data: Record<string, unknown>
}

export function diagnosisScript(trigger: TriggerInstance, reviewId: string): ScriptStep[] {
  const rule = typeof trigger.payload?.rule === 'string' ? trigger.payload.rule : undefined
  return [
    {
      offsetMs: 0,
      type: 'trigger.fired',
      targetId: trigger.id,
      data: {
        instanceId: trigger.id,
        definitionId: trigger.triggerDefinitionId,
        name: trigger.name,
        triggerType: trigger.type,
        source: trigger.source,
        summary: trigger.summary,
        rule,
        actual: trigger.payload?.actual,
        threshold: trigger.payload?.threshold,
        payload: trigger.payload ?? {},
      },
    },
    { offsetMs: 40, type: 'run.started', data: { goal: trigger.summary } },
    { offsetMs: 1000, type: 'coordinator.started', sourceId: trigger.id, data: { agentId: 'coordinator', name: 'Coordinator' } },
    { offsetMs: 2000, type: 'agent.delegated', sourceId: 'coordinator', targetId: 'c2', data: { agentId: 'c2', name: 'C2 掘进控制', role: '施工控制' } },
    { offsetMs: 2200, type: 'agent.started', targetId: 'c2', data: { agentId: 'c2' } },
    { offsetMs: 3000, type: 'agent.delegated', sourceId: 'coordinator', targetId: 'c6', data: { agentId: 'c6', name: 'C6 渣土评估', role: '物料分析' } },
    { offsetMs: 3200, type: 'agent.started', targetId: 'c6', data: { agentId: 'c6' } },
    {
      offsetMs: 4000,
      type: 'api.called',
      sourceId: 'c6',
      targetId: 'api_foam',
      data: { agentId: 'c6', name: 'Foam API', kind: 'api', toolId: 'api_foam', durationMs: 860, status: 'completed', input: { ring: 1250, channel: 'foam.pressure' }, output: { pressureBar: 3.1, fluctuation: 'out_of_band' } },
    },
    { offsetMs: 5000, type: 'agent.delegated', sourceId: 'coordinator', targetId: 'c1', data: { agentId: 'c1', name: 'C1 地质建模', role: '地质分析' } },
    { offsetMs: 5200, type: 'agent.started', targetId: 'c1', data: { agentId: 'c1' } },
    { offsetMs: 7000, type: 'agent.spawned', sourceId: 'c1', targetId: 'c1_sub', data: { agentId: 'c1_sub', parentId: 'c1', name: 'Geological Sub-Agent' } },
    { offsetMs: 7200, type: 'agent.started', targetId: 'c1_sub', data: { agentId: 'c1_sub' } },
    {
      offsetMs: 8500,
      type: 'agent.message',
      sourceId: 'c1',
      targetId: 'coordinator',
      data: { agentId: 'c1', to: 'coordinator', text: '前方 50–80 环为砂层与泥岩交界，掘进阻力可能上升。' },
    },
    {
      offsetMs: 10000,
      type: 'human_review.requested',
      sourceId: 'coordinator',
      data: {
        reviewId,
        name: '参数建议审核',
        agentId: 'coordinator',
        reason: '建议将改变土仓压力与泡沫注入设定，超出自动执行范围。',
        result: '建议推力维持当前区间，泡沫注入比提高约 8%，并在后续 2 环内复核掌子面含水率。',
        risk: '中。交界地层叠加扭矩抬升，存在结泥饼与推力波动风险。',
        missing: ['掌子面前方 5 m 含水率复核', '泡沫系统实时压力曲线'],
        recommendation: '批准为施工建议。平台不向 PLC 下发控制指令。',
      },
    },
  ]
}

export function completedScript(trigger: TriggerInstance, reviewId: string): ScriptStep[] {
  const live = diagnosisScript(trigger, reviewId).map((step) => ({ ...step, offsetMs: Math.round(step.offsetMs * 8) }))
  return [
    ...live,
    { offsetMs: 90000, type: 'agent.completed', data: { agentId: 'c2', summary: '推进速度稳定在 41 mm/min，土仓压力未越界。' } },
    { offsetMs: 96000, type: 'agent.completed', data: { agentId: 'c6', summary: '渣土含水率偏高，泡沫压力有波动。' } },
    { offsetMs: 110000, type: 'agent.completed', data: { agentId: 'c1_sub', summary: '交界带范围约 50–80 环。' } },
    { offsetMs: 120000, type: 'agent.completed', data: { agentId: 'c1', summary: '地质模型已更新，风险等级中。' } },
    { offsetMs: 150000, type: 'mcp.called', sourceId: 'c1', data: { agentId: 'c1', name: '地层分析模型', kind: 'mcp', toolId: 'mcp_geo', durationMs: 2400, status: 'completed', input: { ringFrom: 1220, ringTo: 1250 }, output: { boundary: 'sand-mudstone', confidence: 0.81 } } },
    { offsetMs: 160000, type: 'tool.called', sourceId: 'c2', data: { agentId: 'c2', name: '参数计算工具', kind: 'tool', durationMs: 1800, status: 'completed', retry: 1, level: 'warn', error: '地层强度字段缺失，已用邻近环插值后重试成功。', input: { rings: 30 }, output: { thrustMn: '42–46' } } },
    { offsetMs: 200000, type: 'run.completed', data: { summary: '当前地层以交界带为主。建议维持推进速度 38–42 mm/min，并提高泡沫注入比。此为建议，不下发设备指令。' } },
  ]
}

export function failedScript(trigger: TriggerInstance): ScriptStep[] {
  return [
    {
      offsetMs: 0,
      type: 'trigger.fired',
      data: { instanceId: trigger.id, name: trigger.name, triggerType: trigger.type, source: trigger.source, summary: trigger.summary, payload: trigger.payload ?? {} },
    },
    { offsetMs: 20, type: 'run.started', data: {} },
    { offsetMs: 400, type: 'coordinator.started', data: { agentId: 'coordinator', name: 'Coordinator' } },
    { offsetMs: 900, type: 'agent.delegated', sourceId: 'coordinator', data: { agentId: 'c3', name: 'C3 刀盘磨损预测', role: '设备健康' } },
    { offsetMs: 1100, type: 'agent.started', data: { agentId: 'c3' } },
    { offsetMs: 2000, type: 'api.called', sourceId: 'c3', data: { agentId: 'c3', name: '刀盘监测 API', kind: 'api', status: 'failed', durationMs: 500, error: '刀盘监测 API 超时', level: 'error' } },
    { offsetMs: 2600, type: 'agent.failed', data: { agentId: 'c3', error: '刀盘监测 API 超时，无法完成磨损预测。' } },
    { offsetMs: 3000, type: 'run.failed', data: { error: '关键数据源不可用，运行失败。未向设备下发任何指令。' } },
  ]
}
