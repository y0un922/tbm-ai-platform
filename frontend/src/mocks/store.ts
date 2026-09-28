import type {
  AgentRecord,
  Capability,
  DashboardSnapshot,
  PlatformSettings,
  Playbook,
  Project,
  Run,
  RuntimeEvent,
  TriggerDefinition,
  TriggerInstance,
} from '@/types'
import { completedScript, failedScript } from '@/mocks/script'

const NOW = Date.now()
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()

export interface Store {
  projects: Project[]
  agents: AgentRecord[]
  triggers: TriggerDefinition[]
  instances: TriggerInstance[]
  playbooks: Playbook[]
  capabilities: Capability[]
  runs: Run[]
  events: RuntimeEvent[]
  settings: PlatformSettings
  dashboards: Record<string, DashboardSnapshot>
  demoStarted: boolean
}

function trend(base: number, drift: number) {
  return Array.from({ length: 30 }, (_, i) => ({
    x: String(1221 + i),
    y: Math.round((base + Math.sin(i / 2.7) * base * 0.06 + i * drift) * 100) / 100,
  }))
}

function blankRun(partial: Pick<Run, 'id' | 'projectId' | 'goal' | 'trigger' | 'startedAt'> & Partial<Run>): Run {
  return {
    status: 'pending',
    coordinatorId: 'coordinator',
    participatingAgentIds: [],
    spawnedAgentIds: [],
    toolCallCount: 0,
    messageCount: 0,
    riskLevel: 'medium',
    ...partial,
  }
}

function materialize(runId: string, steps: { offsetMs: number; type: RuntimeEvent['type']; sourceId?: string; targetId?: string; data: Record<string, unknown> }[], start: number): RuntimeEvent[] {
  return steps.map((step, i) => ({
    id: `${runId}_${i}_${step.type}`,
    runId,
    type: step.type,
    timestamp: new Date(start + step.offsetMs).toISOString(),
    sourceId: step.sourceId,
    targetId: step.targetId,
    data: step.data,
  }))
}

export function applyEvent(store: Store, event: RuntimeEvent) {
  const run = store.runs.find((r) => r.id === event.runId)
  if (!run || run.status === 'completed' || run.status === 'failed') return
  const agentId = typeof event.data.agentId === 'string' ? event.data.agentId : ''
  if (event.type === 'run.started') {
    run.status = run.status === 'pending' ? 'running' : run.status
    run.startedAt = event.timestamp
  }
  if (event.type === 'stage.started') run.status = 'running'
  if (event.type === 'human_review.decided' && run.humanReview && run.humanReview.id === event.data.reviewId) {
    const decision = event.data.decision
    if (decision === 'approve') run.humanReview.status = 'approved'
    if (decision === 'reject') run.humanReview.status = 'rejected'
    if (decision === 'request_more_data') run.humanReview.status = 'needs_data'
  }
  if (event.type === 'agent.delegated' && agentId && !run.participatingAgentIds.includes(agentId)) run.participatingAgentIds.push(agentId)
  if (event.type === 'agent.spawned' && agentId && !run.spawnedAgentIds.includes(agentId)) run.spawnedAgentIds.push(agentId)
  if (event.type === 'tool.called' || event.type === 'api.called' || event.type === 'mcp.called') run.toolCallCount += 1
  if (event.type === 'agent.message') run.messageCount += 1
  if (event.type === 'human_review.requested') {
    run.status = 'review'
    run.humanReview = {
      id: String(event.data.reviewId ?? event.id),
      status: 'pending',
      reason: String(event.data.reason ?? ''),
      agentId: String(event.data.agentId ?? 'coordinator'),
      result: String(event.data.result ?? ''),
      risk: String(event.data.risk ?? ''),
      missing: Array.isArray(event.data.missing) ? event.data.missing.filter((x): x is string => typeof x === 'string') : [],
      recommendation: String(event.data.recommendation ?? ''),
      supplement: typeof event.data.supplement === 'string' ? event.data.supplement : undefined,
    }
  }
  if (event.type === 'run.completed') {
    run.status = 'completed'
    run.endedAt = event.timestamp
    run.resultSummary = String(event.data.summary ?? '')
    if (run.humanReview?.status === 'pending') run.humanReview.status = 'approved'
  }
  if (event.type === 'run.failed') {
    run.status = 'failed'
    run.endedAt = event.timestamp
    run.resultSummary = String(event.data.error ?? '')
    run.riskLevel = 'high'
  }
}

function createStore(): Store {
  const projects: Project[] = [
    { id: 'proj_a', name: '项目A', line: '右线区间', stage: '掘进施工', status: 'attention', ring: 1250, totalRings: 3280, lengthKm: 3.28, breakthroughAt: '2025-03-15' },
    { id: 'proj_b', name: '项目B', line: '左线区间', stage: '筹备', status: 'preparing', ring: 0, totalRings: 3100, lengthKm: 3.1 },
  ]

  const agents: AgentRecord[] = [
    { id: 'coordinator', name: 'Coordinator', code: 'COORD', role: '协调调度', status: 'online', description: '理解目标与触发上下文，自主选择专业 Agent，决定并行、补位、工具调用和人工审核。', instructions: '你是盾构施工多智能体协调器。根据 Trigger 与工程上下文组织专业 Agent。不得直接下发设备控制指令。高风险参数建议必须请求人工审核。', capabilities: ['任务理解', '多 Agent 调度', '结果整合', '审核升级'], toolIds: ['tool_risk'], apiIds: [], mcpIds: [], dataSourceIds: ['ds_sensor'], permissions: ['read:telemetry', 'spawn:limited', 'request:review'], spawnPolicy: '仅可派生已注册 Sub-Agent，单次运行不超过平台上限。', runtimePolicy: '可并行委派。缺少关键数据时停止建议并请求补数。', timeoutSec: 180, retry: 1, version: '1.4.0', model: '待配置', owner: '张工程师', updatedAt: iso(-86400000), successRate7d: 0.985 },
    { id: 'c1', name: 'C1 地质建模', code: 'C1', role: '地质分析', status: 'online', description: '地质结构建模与地层风险研判。', instructions: '基于勘察、地震波速与掘进反馈更新地质认识，指出交界面、含水异常和风险范围。', capabilities: ['地层建模', '风险识别', 'Sub-Agent 派生'], toolIds: ['tool_viz'], apiIds: [], mcpIds: ['mcp_geo'], dataSourceIds: ['ds_geo', 'ds_sensor'], permissions: ['read:geology', 'spawn:geology'], spawnPolicy: '可派生地质 Sub-Agent 做局部解释。', runtimePolicy: '证据不足时明确缺失项，不输出确定性结论。', timeoutSec: 180, retry: 2, version: '1.2.0', model: '待配置', owner: '地质组', updatedAt: iso(-3600000), successRate7d: 0.97 },
    { id: 'c2', name: 'C2 掘进控制', code: 'C2', role: '施工控制', status: 'online', description: '掘进参数分析与优化建议。', instructions: '分析推力、土压、推进速度与扭矩。只输出建议区间，不生成设备写指令。', capabilities: ['参数分析', '稳定性判断'], toolIds: ['tool_param'], apiIds: [], mcpIds: [], dataSourceIds: ['ds_sensor', 'ds_plc'], permissions: ['read:telemetry'], spawnPolicy: '默认不派生。', runtimePolicy: '建议必须附带适用环号与前提。', timeoutSec: 120, retry: 2, version: '1.3.1', model: '待配置', owner: '李工', updatedAt: iso(-7200000), successRate7d: 0.96 },
    { id: 'c3', name: 'C3 刀盘磨损预测', code: 'C3', role: '设备健康', status: 'standby', description: '刀盘磨损预测、寿命评估与维护建议。', instructions: '结合扭矩、推力与监测 API 评估刀具状态。数据中断时失败并说明缺口。', capabilities: ['磨损预测', '维护建议'], toolIds: [], apiIds: ['api_cutter'], mcpIds: ['mcp_wear'], dataSourceIds: ['ds_plc'], permissions: ['read:cutter'], spawnPolicy: '默认不派生。', runtimePolicy: '监测 API 不可用时不得猜测剩余寿命。', timeoutSec: 150, retry: 1, version: '1.1.0', model: '待配置', owner: '设备组', updatedAt: iso(-86400000 * 2), successRate7d: 0.91 },
    { id: 'c4', name: 'C4 管片拼装控制', code: 'C4', role: '施工控制', status: 'online', description: '管片姿态与拼装质量分析。', instructions: '识别姿态偏差与拼装质量风险，输出复核要点。', capabilities: ['姿态分析', '质量复核'], toolIds: ['tool_viz'], apiIds: [], mcpIds: [], dataSourceIds: ['ds_plc'], permissions: ['read:segment'], spawnPolicy: '可请求图像 Sub-Agent，需 Coordinator 允许。', runtimePolicy: '质量结论需附带测点。', timeoutSec: 120, retry: 1, version: '1.0.2', model: '待配置', owner: '王工', updatedAt: iso(-5400000), successRate7d: 0.94 },
    { id: 'c6', name: 'C6 渣土评估', code: 'C6', role: '物料分析', status: 'online', description: '渣土特性、泡沫系统与外运状态评估。', instructions: '评估渣土状态和泡沫系统供给，解释对掘进效率的影响。', capabilities: ['渣土评估', '泡沫系统诊断'], toolIds: [], apiIds: ['api_foam', 'api_lab'], mcpIds: [], dataSourceIds: ['ds_sensor'], permissions: ['read:muck', 'read:foam'], spawnPolicy: '默认不派生。', runtimePolicy: '压力波动需引用数据源时间窗。', timeoutSec: 120, retry: 2, version: '1.2.3', model: '待配置', owner: '设备组', updatedAt: iso(-1800000), successRate7d: 0.95 },
  ]

  const playbooks: Playbook[] = [
    { id: 'pb_eff', projectId: 'proj_a', name: '掘进效率异常诊断', status: 'enabled', description: '效率指标异常时启动诊断。Coordinator 自主选择专业 Agent。', triggerDefinitionId: 'def_fir', version: '1.3.0', updatedAt: iso(-86400000), constraints: ['不得下发设备控制指令', '排除计划停机、换刀与保养窗口', '建议必须附带数据时间窗'], humanReview: { required: true, when: '参数建议超出当前设定带', roles: ['项目工程师', '专家组'] }, output: { description: '诊断报告、原因分析、处置建议', destinations: ['运行记录', '项目工程师'] }, notification: '站内通知项目工程师', archiving: '随运行记录保留' },
    { id: 'pb_geo', projectId: 'proj_a', name: '地层变化研判', status: 'testing', description: '地质参数异常时研判风险。不预设 Agent 顺序。', triggerDefinitionId: undefined, version: '1.1.0', updatedAt: iso(-86400000 * 3), constraints: ['证据不足时输出缺失项', '不自动调整掘进设定'], humanReview: { required: true, when: '风险等级达到中及以上', roles: ['地质组'] }, output: { description: '地层风险说明', destinations: ['运行记录'] }, notification: '站内通知地质组', archiving: '随运行记录保留' },
    { id: 'pb_cutter', projectId: 'proj_a', name: '刀盘磨损预警', status: 'enabled', description: '磨损相关系统事件触发后的建议流程。', triggerDefinitionId: 'def_torque', version: '1.2.1', updatedAt: iso(-86400000 * 2), constraints: ['监测数据缺失时失败，不猜测寿命'], humanReview: { required: false, when: '仅在建议换刀时审核', roles: ['设备组'] }, output: { description: '磨损状态与维护建议', destinations: ['运行记录', '设备组'] }, notification: '高严重度立即通知', archiving: '保留 365 天' },
    { id: 'pb_segment', projectId: 'proj_a', name: '管片拼装复核', status: 'disabled', description: '拼装完成后的质量复核策略。', version: '1.0.0', updatedAt: iso(-86400000 * 6), constraints: ['未启用，不接受触发'], humanReview: { required: true, when: '质量异常', roles: ['质量工程师'] }, output: { description: '复核清单', destinations: ['运行记录'] }, notification: '不通知', archiving: '随运行记录保留' },
    { id: 'pb_daily', projectId: 'proj_a', name: '每日班前巡检', status: 'enabled', description: '定时生成班前关注事项。', triggerDefinitionId: 'def_daily', version: '1.1.2', updatedAt: iso(-86400000), constraints: ['只读巡检，不改变任何设定'], humanReview: { required: false, when: '出现高风险项时升级', roles: ['当班工程师'] }, output: { description: '班前关注清单', destinations: ['运行记录', '当班工程师'] }, notification: '每日 08:05 站内通知', archiving: '保留 180 天' },
  ]

  playbooks[0].stages = [
    { id: 'eff_collect', name: '工况与证据', goal: '整理掘进效率与泡沫系统异常证据', agentIds: ['c2', 'c6'], output: '工况与异常证据清单（Mock）', requiresReview: false },
    { id: 'eff_diagnose', name: '多 Agent 诊断', goal: '结合地层、施工与渣土证据解释效率下降', agentIds: ['c1', 'c2', 'c6'], output: '多 Agent 原因分析（Mock）', requiresReview: false },
    { id: 'eff_review', name: '建议复核', goal: '汇总诊断结论与处置建议，提交人工复核', agentIds: [], output: '诊断摘要与处置建议（Mock）', requiresReview: true },
  ]

  const triggers: TriggerDefinition[] = [
    { id: 'def_fir', name: 'FIR 连续下降', type: 'metric_threshold', enabled: true, projectId: 'proj_a', description: '掘进效率连续下降时请求诊断。', config: { source: 'SCADA', condition: '连续 5 环下降 > 20%', dataSource: '传感器数据', metric: 'FIR', debounceSec: 0, cooldownSec: 600, severity: 'high', playbookId: 'pb_eff' } },
    { id: 'def_daily', name: '每日施工分析', type: 'schedule', enabled: true, projectId: 'proj_a', description: '每个施工日早班自动生成分析。', config: { source: 'Timer', condition: '每天 08:00', dataSource: '施工日志', schedule: '0 8 * * *', debounceSec: 0, cooldownSec: 86400, severity: 'info', playbookId: 'pb_daily' } },
    { id: 'def_torque', name: '刀盘扭矩异常', type: 'system_event', enabled: true, projectId: 'proj_a', description: 'PLC 故障或扭矩越限事件。', config: { source: 'PLC', condition: '扭矩越限或 Fault Event', dataSource: 'PLC 数据', debounceSec: 30, cooldownSec: 300, severity: 'high', playbookId: 'pb_cutter' } },
    { id: 'def_hook', name: '外部施工系统回调', type: 'webhook', enabled: false, projectId: 'proj_a', description: '外部系统通过 Webhook 发起分析。', config: { source: '施工管理系统', condition: 'POST /hooks/tbm-analysis', dataSource: '外部工单', debounceSec: 5, cooldownSec: 60, severity: 'medium', playbookId: '' } },
    { id: 'def_ext', name: '外部 API 分析请求', type: 'external_api', enabled: true, projectId: 'proj_a', description: '外部施工系统 API 发起的分析请求。', config: { source: '外部施工系统', condition: '已认证的分析请求', dataSource: '外部工单', debounceSec: 0, cooldownSec: 120, severity: 'low', playbookId: '' } },
  ]

  const geoTrigger: TriggerInstance = { id: 'ti_geo', triggerDefinitionId: 'def_ext', type: 'external_api', name: '外部施工系统分析请求', source: '外部施工系统', summary: '请求对 1250 环附近地层与掘进参数做联合分析', timestamp: iso(-2 * 3600 * 1000), payload: { rule: '外部系统已认证请求', actual: 'ring 1250', threshold: '—', failed: false } }
  const torqueTrigger: TriggerInstance = { id: 'ti_torque', triggerDefinitionId: 'def_torque', type: 'system_event', name: '刀盘扭矩异常', source: 'PLC', summary: '刀盘扭矩越限事件', timestamp: iso(-5 * 3600 * 1000), payload: { rule: '扭矩越限', actual: '3120 kN·m', threshold: '3000 kN·m', failed: false } }
  const hookFail: TriggerInstance = { id: 'ti_hook_fail', triggerDefinitionId: 'def_hook', type: 'webhook', name: '外部施工系统回调', source: '施工管理系统', summary: 'Webhook 投递失败，未创建运行', timestamp: iso(-40 * 60 * 1000), payload: { failed: true, error: '签名校验失败' } }
  const dailyTrigger: TriggerInstance = { id: 'ti_daily', triggerDefinitionId: 'def_daily', type: 'schedule', name: '每日施工分析', source: 'Timer', summary: '08:00 定时分析已完成', timestamp: iso(-90 * 60 * 1000), payload: { rule: '每天 08:00', actual: '08:00', threshold: '—', failed: false } }

  const capabilities: Capability[] = [
    { id: 'ds_sensor', name: '传感器数据', kind: 'data_source', status: 'online', description: '推力、扭矩、土压、推进速度等实时传感器数据。', owner: '王工', syncedAt: iso(-2 * 60 * 1000), agentIds: ['c1', 'c2', 'c6', 'coordinator'], endpoint: '待接入', protocol: 'TBD', latencyMs: 32, tags: ['telemetry'] },
    { id: 'ds_plc', name: 'PLC 数据', kind: 'data_source', status: 'online', description: '盾构机 PLC 状态与故障事件。接口契约尚未冻结。', owner: '李工', syncedAt: iso(-4 * 60 * 1000), agentIds: ['c2', 'c3', 'c4'], endpoint: '待接入', protocol: 'TBD', latencyMs: 40, tags: ['plc'] },
    { id: 'ds_geo', name: '地质数据库', kind: 'data_source', status: 'online', description: '地层、岩性与地下水资料。', owner: '地质组', syncedAt: iso(-70 * 60 * 1000), agentIds: ['c1'], endpoint: '待接入', protocol: 'TBD', tags: ['geology'] },
    { id: 'tool_risk', name: '风险评估工具', kind: 'tool', status: 'online', description: '施工风险归纳。不执行设备控制。', owner: '张工', syncedAt: iso(-20 * 60 * 1000), agentIds: ['coordinator', 'c2'], tags: ['risk'] },
    { id: 'tool_viz', name: '三维可视化引擎', kind: 'tool', status: 'online', description: '地质与姿态结果可视化。', owner: '算法组', syncedAt: iso(-25 * 60 * 1000), agentIds: ['c1', 'c4'], tags: ['viz'] },
    { id: 'tool_param', name: '参数计算工具', kind: 'tool', status: 'online', description: '根据地层与约束计算建议参数区间。', owner: '李工', syncedAt: iso(-15 * 60 * 1000), agentIds: ['c2'], tags: ['advice'] },
    { id: 'api_foam', name: 'Foam API', kind: 'api', status: 'online', description: '泡沫注入量、压力与流量。', owner: '设备组', syncedAt: iso(-6 * 60 * 1000), agentIds: ['c6'], endpoint: '待接入', protocol: 'HTTPS', latencyMs: 48, tags: ['foam'] },
    { id: 'api_lab', name: '渣土实验室 API', kind: 'api', status: 'degraded', description: '渣土成分与含水率。当前延迟升高。', owner: '试验室', syncedAt: iso(-35 * 60 * 1000), agentIds: ['c6'], endpoint: '待接入', protocol: 'HTTPS', latencyMs: 420, tags: ['lab'] },
    { id: 'api_cutter', name: '刀盘监测 API', kind: 'api', status: 'degraded', description: '振动、温度与扭矩监测。', owner: '设备组', syncedAt: iso(-50 * 60 * 1000), agentIds: ['c3'], endpoint: '待接入', protocol: 'HTTPS', latencyMs: 800, tags: ['cutter'] },
    { id: 'mcp_geo', name: '地层分析模型', kind: 'mcp', status: 'online', description: '地层岩性识别与风险分析模型服务。', owner: '算法组', syncedAt: iso(-18 * 60 * 1000), agentIds: ['c1'], endpoint: '待接入', protocol: 'MCP', tags: ['model'] },
    { id: 'mcp_wear', name: '磨损预测模型', kind: 'mcp', status: 'offline', description: '刀具磨损模型。供应商未定。', owner: '算法组', syncedAt: iso(-86400000), agentIds: ['c3'], endpoint: '待接入', protocol: 'MCP', tags: ['model'] },
    { id: 'model_primary', name: '主推理模型', kind: 'model', status: 'online', description: '模型供应商 TBD。注册表仅保留槽位。', owner: '平台组', syncedAt: iso(-3 * 3600 * 1000), agentIds: ['coordinator', 'c1', 'c2'], tags: ['llm'] },
    { id: 'kb_cases', name: '施工经验知识库', kind: 'knowledge', status: 'online', description: '历史案例与专家经验。', owner: '知识组', syncedAt: iso(-5 * 3600 * 1000), agentIds: ['c1', 'c2', 'coordinator'], tags: ['rag'] },
  ]

  const settings: PlatformSettings = {
    platformName: '盾构机 AI 多智能体协同平台',
    timezone: 'Asia/Shanghai',
    reviewPolicy: '高风险建议必须审核',
    spawnLimit: 5,
    timeoutSec: 180,
    retry: 2,
    density: 'standard',
    language: 'zh-CN',
    retentionDays: { runs: 365, logs: 180, files: 90 },
    auditRetentionDays: 730,
  }

  const dashboards: Record<string, DashboardSnapshot> = {
    proj_a: {
      project: projects[0],
      metrics: [
        { id: 'ring', label: '当前环号', value: '1250', hint: '较上次 +12', tone: 'neutral' },
        { id: 'fir', label: '掘进效率', value: '0.29', unit: 'm/h', hint: '较昨日 +32%', tone: 'good' },
        { id: 'agents', label: '在线 Agent', value: '5', unit: '/ 6', hint: 'C3 待机', tone: 'neutral' },
        { id: 'risks', label: '风险告警', value: '3', hint: '1 高 / 2 中', tone: 'bad' },
        { id: 'reviews', label: '待审核', value: '1', hint: '参数建议待确认', tone: 'warn' },
      ],
      trend: [
        { id: 'fir', name: 'FIR', unit: '环/小时', points: trend(0.36, -0.002) },
        { id: 'speed', name: '推进速度', unit: 'mm/min', points: trend(42, -0.04) },
        { id: 'torque', name: '刀盘扭矩', unit: 'kN·m', points: trend(2400, 8) },
      ],
      progress: {
        current: 1250,
        total: 3280,
        unit: '环',
        caption: '右线区间 · 全长 3.28 km',
        milestones: [
          { label: '当前进展', detail: '第 1250 环 · 关注扭矩与含水', current: true },
          { label: '下一里程碑', detail: '第 1500 环 · 预计 2024-11-20' },
          { label: '区间贯通', detail: '第 3280 环 · 预计 2025-03-15' },
        ],
      },
      risks: [
        { id: 'rk1', severity: 'high', title: '刀盘扭矩波动偏高', detail: '近 20 环扭矩均值较上周上升约 28%。', at: iso(-25 * 60 * 1000) },
        { id: 'rk2', severity: 'medium', title: '掌子面前方含水率异常', detail: '前方约 5 m 含水率上升。', at: iso(-40 * 60 * 1000) },
        { id: 'rk3', severity: 'medium', title: '泡沫注入压力波动', detail: '波动超出当前设定带。', at: iso(-12 * 60 * 1000) },
        { id: 'rk4', severity: 'low', title: '土仓压力短时下降', detail: '已恢复，建议持续观察。', at: iso(-70 * 60 * 1000) },
      ],
      summary: {
        text: '近 24 小时掘进效率回升，但 FIR 在最近 5 环连续下降。扭矩抬升与泡沫压力波动需要专业 Agent 联合解释。以下为分析摘要，不是设备指令。',
        updatedAt: iso(-15 * 60 * 1000),
        insights: [
          { tone: 'ok', text: '掘进效率回升至 0.29 m/h，较昨日提升约 32%。' },
          { tone: 'ok', text: '土仓压力仍在观察区间内。' },
          { tone: 'warn', text: '刀盘扭矩呈上升趋势，建议 48 小时内复核。' },
          { tone: 'warn', text: '前方地层含水率偏高，需地质侧继续研判。' },
        ],
      },
      engineeringMetrics: [
        { id: 'speed', label: '推进速度', value: '41 mm/min', range: '40–60', inRange: true },
        { id: 'pressure', label: '土仓压力', value: '1.25 bar', range: '1.2–1.6', inRange: true },
        { id: 'torque', label: '刀盘扭矩', value: '2,680 kN·m', range: '≤ 3,000', inRange: true },
        { id: 'screw', label: '螺旋机转速', value: '3.2 rpm', range: '2.5–4.0', inRange: true },
        { id: 'foam', label: '泡沫注入压力', value: '3.1 bar', range: '2.5–3.5', inRange: true },
      ],
    },
    proj_b: {
      project: projects[1],
      metrics: [
        { id: 'ring', label: '当前环号', value: '0', hint: '尚未始发', tone: 'neutral' },
        { id: 'fir', label: '掘进效率', value: '—', hint: '无遥测', tone: 'neutral' },
        { id: 'agents', label: '在线 Agent', value: '5', unit: '/ 6', hint: '平台注册表', tone: 'neutral' },
        { id: 'risks', label: '风险告警', value: '0', hint: '无项目告警', tone: 'good' },
        { id: 'reviews', label: '待审核', value: '0', hint: '无待办', tone: 'neutral' },
      ],
      trend: [],
      progress: { current: 0, total: 3100, unit: '环', caption: '左线区间 · 筹备中', milestones: [{ label: '当前进展', detail: '未始发', current: true }] },
      risks: [],
      summary: { text: '该项目尚未接入施工遥测。Trigger 与运行记录为空。', updatedAt: iso(0), insights: [] },
      engineeringMetrics: [],
    },
  }

  const store: Store = {
    projects,
    agents,
    triggers,
    instances: [geoTrigger, torqueTrigger, hookFail, dailyTrigger],
    playbooks,
    capabilities,
    runs: [],
    events: [],
    settings,
    dashboards,
    demoStarted: false,
  }

  const geoStart = NOW - 2 * 3600 * 1000
  const geoRun = blankRun({ id: 'run_geo', projectId: 'proj_a', goal: '分析 1250 环附近地层并给出掘进参数建议', trigger: geoTrigger, startedAt: new Date(geoStart).toISOString(), riskLevel: 'low' })
  store.runs.push(geoRun)
  for (const event of materialize('run_geo', completedScript(geoTrigger, 'rv_geo'), geoStart)) {
    store.events.push(event)
    applyEvent(store, event)
  }
  geoRun.riskLevel = 'low'

  const torqueStart = NOW - 5 * 3600 * 1000
  const torqueRun = blankRun({ id: 'run_torque', projectId: 'proj_a', goal: '解释刀盘扭矩越限并评估磨损', trigger: torqueTrigger, startedAt: new Date(torqueStart).toISOString(), riskLevel: 'high' })
  store.runs.push(torqueRun)
  for (const event of materialize('run_torque', failedScript(torqueTrigger), torqueStart)) {
    store.events.push(event)
    applyEvent(store, event)
  }

  return store
}

const g = globalThis as typeof globalThis & { __tbmStore?: Store }
export const store = g.__tbmStore ?? (g.__tbmStore = createStore())
