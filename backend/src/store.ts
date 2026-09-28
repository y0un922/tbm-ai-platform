import type {
  AgentRecord,
  Capability,
  DashboardSnapshot,
  PlatformSettings,
  Playbook,
  PlaybookStage,
  Project,
  Run,
  RuntimeEvent,
  TriggerDefinition,
  TriggerInstance,
} from '../../frontend/src/types/index.ts'

const iso = (ms = 0) => new Date(Date.now() + ms).toISOString()

export interface EvidenceItem {
  agentId: string
  partition: string
  summary: string
  ring?: number
  toolId?: string
  timestamp: string
  data?: unknown
}

export interface EvidenceState {
  geology: EvidenceItem[]
  tunneling: EvidenceItem[]
  muck: EvidenceItem[]
  cutterhead: EvidenceItem[]
  conclusion?: { text: string; reason?: string; risk?: string; missing?: string[]; recommendation?: string }
}

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
  evidence: Record<string, EvidenceState>
  stageIndex: Record<string, number>
}

export const PARTITION: Record<string, keyof Omit<EvidenceState, 'conclusion'>> = {
  c1: 'geology',
  c2: 'tunneling',
  c6: 'muck',
  c3: 'cutterhead',
}

export function emptyEvidence(): EvidenceState {
  return { geology: [], tunneling: [], muck: [], cutterhead: [] }
}

export function getPlaybookStages(playbook: Playbook): PlaybookStage[] {
  return playbook.stages ?? [{
    id: `${playbook.id || 'draft'}_analysis`,
    name: '分析与建议',
    goal: playbook.description,
    agentIds: [],
    output: playbook.output.description,
    requiresReview: playbook.humanReview.required,
  }]
}

export function validatePlaybook(playbook: Playbook, registeredAgentIds?: string[]): string | undefined {
  if (typeof playbook.name !== 'string' || !playbook.name.trim() || playbook.name.trim().length > 100) return '工作流名称需为 1–100 字'
  if (!['enabled', 'testing', 'disabled'].includes(playbook.status)) return '无效的工作流状态'
  const stages = getPlaybookStages(playbook)
  if (!Array.isArray(stages) || stages.length === 0 || stages.length > 20) return '工作流需包含 1–20 个阶段'
  const ids = new Set<string>()
  for (const [index, stage] of stages.entries()) {
    const label = `阶段 ${index + 1}`
    if (!stage || typeof stage.id !== 'string' || !stage.id.trim() || ids.has(stage.id)) return `${label}的标识缺失或重复`
    ids.add(stage.id)
    if (typeof stage.name !== 'string' || !stage.name.trim() || stage.name.trim().length > 100) return `${label}名称需为 1–100 字`
    if (typeof stage.goal !== 'string' || !stage.goal.trim() || stage.goal.trim().length > 5000) return `${label}任务目标需为 1–5000 字`
    if (typeof stage.output !== 'string' || !stage.output.trim() || stage.output.trim().length > 2000) return `${label}预期输出需为 1–2000 字`
    if (typeof stage.requiresReview !== 'boolean') return `${label}需要明确审核方式`
    if (!Array.isArray(stage.agentIds) || stage.agentIds.some((id) => typeof id !== 'string' || !id.trim() || (registeredAgentIds && !registeredAgentIds.includes(id))) || new Set(stage.agentIds).size !== stage.agentIds.length) return `${label}包含无效或重复的 Agent`
  }
}

function agent(row: AgentRecord): AgentRecord {
  return row
}

export function createStore(): Store {
  const projects: Project[] = [
    { id: 'proj_a', name: '项目A', line: '右线区间', stage: '掘进施工', status: 'attention', ring: 1250, totalRings: 3280, lengthKm: 3.28, breakthroughAt: '2025-03-15' },
    { id: 'proj_b', name: '项目B', line: '左线区间', stage: '筹备', status: 'preparing', ring: 0, totalRings: 3100, lengthKm: 3.1 },
  ]

  const agents: AgentRecord[] = [
    agent({ id: 'coordinator', name: 'Coordinator', code: 'COORD', role: '协调调度', status: 'online', description: '只调度与综合，不替代专业判断。按用户任务选最少的专业 Agent。', instructions: '你是盾构施工协调器。职责：理解用户任务、委派最少相关专业 Agent、综合证据、该审核时送审。禁止 PLC。不要把名单点一遍。结论必须引用环号与证据。冲突保留候选。', capabilities: ['任务理解', '按需调度', '结果整合', '审核升级'], toolIds: ['tool_risk'], apiIds: [], mcpIds: [], dataSourceIds: ['ds_sensor'], permissions: ['read:telemetry', 'spawn:limited', 'request:review'], spawnPolicy: '仅可派生已注册 Agent，且每次阶段最多 2 个。', runtimePolicy: '缺少关键数据时停止建议并请求补数。', timeoutSec: 180, retry: 1, version: '1.4.0', model: 'pi', owner: '张工程师', updatedAt: iso(-86400000), successRate7d: 0.985 }),
    agent({ id: 'c1', name: 'C1 地质建模', code: 'C1', role: '地质分析', status: 'online', description: '只管地层、交界面、含水。不管掘进参数建议。', instructions: '职责仅限地质。判断岩性、交界面、含水异常。只写 evidence.geology。禁止给推力/泡沫设定。证据不足就写缺失项。', capabilities: ['地层建模', '风险识别'], toolIds: ['tool_viz'], apiIds: [], mcpIds: ['mcp_geo'], dataSourceIds: ['ds_geo', 'ds_sensor'], permissions: ['read:geology'], spawnPolicy: '默认不派生。', runtimePolicy: '证据不足时明确缺失项。', timeoutSec: 180, retry: 2, version: '1.2.0', model: 'pi', owner: '地质组', updatedAt: iso(-3600000), successRate7d: 0.97 }),
    agent({ id: 'c2', name: 'C2 掘进控制', code: 'C2', role: '施工控制', status: 'online', description: '只管掘进参数：FIR、贯入度、推力、扭矩、推进速度。', instructions: '职责仅限掘进参数。分析 FIR、贯入度、推力、扭矩、推进速度。只写 evidence.tunneling。只给建议区间，禁止设备写指令，必须带环号。', capabilities: ['参数分析', '稳定性判断'], toolIds: ['tool_param'], apiIds: [], mcpIds: [], dataSourceIds: ['ds_sensor', 'ds_plc'], permissions: ['read:telemetry'], spawnPolicy: '默认不派生。', runtimePolicy: '建议必须附带适用环号与前提。', timeoutSec: 120, retry: 2, version: '1.3.1', model: 'pi', owner: '李工', updatedAt: iso(-7200000), successRate7d: 0.96 }),
    agent({ id: 'c3', name: 'C3 刀盘磨损预测', code: 'C3', role: '设备健康', status: 'standby', description: '只管刀具/刀盘寿命。扭矩高不等于必须上场。', instructions: '职责仅限刀盘磨损与寿命。只写 evidence.cutterhead。数据中断不得猜寿命。不要解释地质或泡沫。', capabilities: ['磨损预测', '维护建议'], toolIds: [], apiIds: ['api_cutter'], mcpIds: ['mcp_wear'], dataSourceIds: ['ds_plc'], permissions: ['read:cutter'], spawnPolicy: '默认不派生。', runtimePolicy: '监测不可用时不得猜测寿命。', timeoutSec: 150, retry: 1, version: '1.1.0', model: 'pi', owner: '设备组', updatedAt: iso(-86400000 * 2), successRate7d: 0.91 }),
    agent({ id: 'c4', name: 'C4 管片拼装控制', code: 'C4', role: '施工控制', status: 'online', description: '只管管片姿态与拼装质量。掘进诊断默认不上场。', instructions: '职责仅限管片拼装与姿态。掘进/泡沫/地质问题不要回答。质量结论需附测点。', capabilities: ['姿态分析', '质量复核'], toolIds: ['tool_viz'], apiIds: [], mcpIds: [], dataSourceIds: ['ds_plc'], permissions: ['read:segment'], spawnPolicy: '默认不派生。', runtimePolicy: '质量结论需附带测点。', timeoutSec: 120, retry: 1, version: '1.0.2', model: 'pi', owner: '王工', updatedAt: iso(-5400000), successRate7d: 0.94 }),
    agent({ id: 'c6', name: 'C6 渣土评估', code: 'C6', role: '物料分析', status: 'online', description: '只管渣土流动性、含水、泡沫供给。', instructions: '职责仅限渣土与泡沫。只写 evidence.muck。引用环号与时间窗。不要给刀盘寿命或管片结论。', capabilities: ['渣土评估', '泡沫系统诊断'], toolIds: [], apiIds: ['api_foam', 'api_lab'], mcpIds: [], dataSourceIds: ['ds_sensor'], permissions: ['read:muck', 'read:foam'], spawnPolicy: '默认不派生。', runtimePolicy: '压力波动需引用数据源时间窗。', timeoutSec: 120, retry: 2, version: '1.2.3', model: 'pi', owner: '设备组', updatedAt: iso(-1800000), successRate7d: 0.95 }),
  ]

  const playbooks: Playbook[] = [
    {
      id: 'pb_eff', projectId: 'proj_a', name: '掘进效率异常诊断', status: 'enabled',
      description: '效率指标异常时启动诊断。阶段内 Coordinator 组织专业 Agent。',
      triggerDefinitionId: 'def_fir', version: '1.4.0', updatedAt: iso(-86400000),
      constraints: ['不得下发设备控制指令', '排除计划停机、换刀与保养窗口', '建议必须附带数据时间窗'],
      humanReview: { required: true, when: '参数建议超出当前设定带', roles: ['项目工程师', '专家组'] },
      output: { description: '诊断报告、原因分析、处置建议与效果验证', destinations: ['运行记录', '项目工程师'] },
      notification: '站内通知项目工程师', archiving: '随运行记录保留',
      stages: [
        { id: 'eff_diagnose', name: '联合诊断', goal: '解释 1250 环附近 FIR 连续下降。Coordinator 按需选择专业 Agent，保留候选原因，不得下发 PLC。', agentIds: [], output: '诊断摘要与处置建议', requiresReview: true },
        { id: 'eff_verify', name: '效果验证', goal: '处理后读取 1251–1252 环，核对 FIR 是否止跌。Coordinator 自行决定是否再问专业 Agent。', agentIds: [], output: '后续环验证结论', requiresReview: false },
      ],
    },
    {
      id: 'pb_geo', projectId: 'proj_a', name: '地层变化研判', status: 'testing',
      description: '地质参数异常时研判风险。不预设 Agent 顺序。',
      version: '1.1.0', updatedAt: iso(-86400000 * 3),
      constraints: ['证据不足时输出缺失项', '不自动调整掘进设定'],
      humanReview: { required: true, when: '风险等级达到中及以上', roles: ['地质组'] },
      output: { description: '地层风险说明', destinations: ['运行记录'] },
      notification: '站内通知地质组', archiving: '随运行记录保留',
    },
    {
      id: 'pb_cutter', projectId: 'proj_a', name: '刀盘磨损预警', status: 'enabled',
      description: '磨损相关系统事件触发后的建议流程。',
      triggerDefinitionId: 'def_torque', version: '1.2.1', updatedAt: iso(-86400000 * 2),
      constraints: ['监测数据缺失时失败，不猜测寿命'],
      humanReview: { required: false, when: '仅在建议换刀时审核', roles: ['设备组'] },
      output: { description: '磨损状态与维护建议', destinations: ['运行记录', '设备组'] },
      notification: '高严重度立即通知', archiving: '保留 365 天',
    },
    {
      id: 'pb_daily', projectId: 'proj_a', name: '每日班前巡检', status: 'enabled',
      description: '定时生成班前关注事项。',
      triggerDefinitionId: 'def_daily', version: '1.1.2', updatedAt: iso(-86400000),
      constraints: ['只读巡检，不改变任何设定'],
      humanReview: { required: false, when: '出现高风险项时升级', roles: ['当班工程师'] },
      output: { description: '班前关注清单', destinations: ['运行记录', '当班工程师'] },
      notification: '每日 08:05 站内通知', archiving: '保留 180 天',
    },
  ]

  const triggers: TriggerDefinition[] = [
    { id: 'def_fir', name: 'FIR 连续下降', type: 'metric_threshold', enabled: true, projectId: 'proj_a', description: '掘进效率连续下降时请求诊断。', config: { source: 'SCADA', condition: '连续 5 环下降 > 20%', dataSource: '传感器数据', metric: 'FIR', debounceSec: 0, cooldownSec: 600, severity: 'high', playbookId: 'pb_eff' } },
    { id: 'def_daily', name: '每日施工分析', type: 'schedule', enabled: true, projectId: 'proj_a', description: '每个施工日早班自动生成分析。', config: { source: 'Timer', condition: '每天 08:00', dataSource: '施工日志', schedule: '0 8 * * *', debounceSec: 0, cooldownSec: 86400, severity: 'info', playbookId: 'pb_daily' } },
    { id: 'def_torque', name: '刀盘扭矩异常', type: 'system_event', enabled: true, projectId: 'proj_a', description: 'PLC 故障或扭矩越限事件。', config: { source: 'PLC', condition: '扭矩越限或 Fault Event', dataSource: 'PLC 数据', debounceSec: 30, cooldownSec: 300, severity: 'high', playbookId: 'pb_cutter' } },
    { id: 'def_hook', name: '外部施工系统回调', type: 'webhook', enabled: false, projectId: 'proj_a', description: '外部系统通过 Webhook 发起分析。', config: { source: '施工管理系统', condition: 'POST /hooks/tbm-analysis', dataSource: '外部工单', debounceSec: 5, cooldownSec: 60, severity: 'medium', playbookId: '' } },
    { id: 'def_ext', name: '外部 API 分析请求', type: 'external_api', enabled: true, projectId: 'proj_a', description: '外部施工系统 API 发起的分析请求。', config: { source: '外部施工系统', condition: '已认证的分析请求', dataSource: '外部工单', debounceSec: 0, cooldownSec: 120, severity: 'low', playbookId: '' } },
  ]

  const capabilities: Capability[] = [
    { id: 'ds_sensor', name: '传感器数据', kind: 'data_source', status: 'online', description: '推力、扭矩、土压、推进速度等。本期为环序列 Mock。', owner: '王工', syncedAt: iso(-2 * 60 * 1000), agentIds: ['c1', 'c2', 'c6', 'coordinator'], endpoint: 'mock://rings', protocol: 'mock', latencyMs: 12, tags: ['telemetry'] },
    { id: 'ds_geo', name: '地质数据库', kind: 'data_source', status: 'online', description: '地层、岩性与地下水资料。', owner: '地质组', syncedAt: iso(-70 * 60 * 1000), agentIds: ['c1'], endpoint: 'mock://geology', protocol: 'mock', tags: ['geology'] },
    { id: 'tool_risk', name: '风险评估工具', kind: 'tool', status: 'online', description: '施工风险归纳。不执行设备控制。', owner: '张工', syncedAt: iso(-20 * 60 * 1000), agentIds: ['coordinator', 'c2'], tags: ['risk'] },
    { id: 'tool_param', name: '参数计算工具', kind: 'tool', status: 'online', description: '根据地层与约束计算建议参数区间。', owner: '李工', syncedAt: iso(-15 * 60 * 1000), agentIds: ['c2'], tags: ['advice'] },
    { id: 'api_foam', name: 'Foam API', kind: 'api', status: 'online', description: '泡沫注入量、压力与流量。', owner: '设备组', syncedAt: iso(-6 * 60 * 1000), agentIds: ['c6'], endpoint: 'mock://foam', protocol: 'mock', latencyMs: 18, tags: ['foam'] },
    { id: 'api_lab', name: '渣土实验室 API', kind: 'api', status: 'degraded', description: '渣土成分与含水率。', owner: '试验室', syncedAt: iso(-35 * 60 * 1000), agentIds: ['c6'], endpoint: 'mock://lab', protocol: 'mock', latencyMs: 40, tags: ['lab'] },
    { id: 'model_primary', name: 'pi Agent Runtime', kind: 'model', status: 'online', description: '专业 Agent 使用本机 pi 已登录模型。', owner: '平台组', syncedAt: iso(), agentIds: ['coordinator', 'c1', 'c2', 'c6'], tags: ['llm', 'pi'] },
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

  const projA = projects[0]
  const dashboards: Record<string, DashboardSnapshot> = {
    proj_a: {
      project: projA,
      metrics: [
        { id: 'ring', label: '当前环号', value: '1250', hint: '较上次 +12', tone: 'neutral' },
        { id: 'fir', label: '掘进效率', value: '0.29', unit: 'm/h', hint: '连续 5 环下降', tone: 'bad' },
        { id: 'agents', label: '在线 Agent', value: '5', unit: '/ 6', hint: 'C3 待机', tone: 'neutral' },
        { id: 'risks', label: '风险告警', value: '3', hint: 'FIR / 扭矩 / 泡沫', tone: 'bad' },
        { id: 'reviews', label: '待审核', value: '0', hint: '无待办', tone: 'neutral' },
      ],
      trend: [
        { id: 'fir', name: 'FIR', unit: 'm/h', points: [1246, 1247, 1248, 1249, 1250].map((ring, i) => ({ x: String(ring), y: [0.42, 0.39, 0.36, 0.33, 0.29][i] })) },
        { id: 'torque', name: '刀盘扭矩', unit: 'kN·m', points: [1246, 1247, 1248, 1249, 1250].map((ring, i) => ({ x: String(ring), y: [2100, 2240, 2380, 2520, 2680][i] })) },
      ],
      progress: {
        current: 1250, total: 3280, unit: '环', caption: '右线区间 · 全长 3.28 km',
        milestones: [
          { label: '当前进展', detail: '第 1250 环 · FIR 连续下降', current: true },
          { label: '下一里程碑', detail: '第 1500 环' },
        ],
      },
      risks: [
        { id: 'rk1', severity: 'high', title: 'FIR 连续 5 环下降', detail: '1246→1250 环由 0.42 降至 0.29 m/h，降幅约 31%。', at: iso(-10 * 60 * 1000) },
        { id: 'rk2', severity: 'medium', title: '刀盘扭矩抬升', detail: '近 5 环扭矩由 2100 升至 2680 kN·m。', at: iso(-12 * 60 * 1000) },
        { id: 'rk3', severity: 'medium', title: '泡沫注入压力波动', detail: '1250 环泡沫压力 3.1 bar，波动越出设定带。', at: iso(-8 * 60 * 1000) },
      ],
      summary: {
        text: '第 1250 环附近 FIR 连续下降，伴随扭矩抬升与泡沫波动。可触发掘进效率异常诊断。系统只给建议，不向 PLC 下发。',
        updatedAt: iso(-5 * 60 * 1000),
        insights: [
          { tone: 'warn', text: 'FIR 五环降幅约 31%，已满足 def_fir 阈值。' },
          { tone: 'warn', text: '扭矩与渣土流动性同时恶化，需多专业联合诊断。' },
          { tone: 'info', text: '本期验证环 1251–1252 为剧本数据，用于闭环演示。' },
        ],
      },
      engineeringMetrics: [
        { id: 'speed', label: '推进速度', value: '41 mm/min', range: '40–60', inRange: true },
        { id: 'pressure', label: '土仓压力', value: '1.25 bar', range: '1.2–1.6', inRange: true },
        { id: 'torque', label: '刀盘扭矩', value: '2,680 kN·m', range: '≤ 3,000', inRange: true },
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
      summary: { text: '该项目尚未接入施工遥测。', updatedAt: iso(), insights: [] },
      engineeringMetrics: [],
    },
  }

  return {
    projects, agents, triggers, instances: [], playbooks, capabilities,
    runs: [], events: [], settings, dashboards, evidence: {}, stageIndex: {},
  }
}

export const store = createStore()

export function applyEvent(event: RuntimeEvent) {
  const run = store.runs.find((item) => item.id === event.runId)
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
      missing: Array.isArray(event.data.missing) ? event.data.missing.filter((item): item is string => typeof item === 'string') : [],
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

export function hydrate<T extends { startedAt: string; endedAt?: string; durationMs?: number }>(run: T): T {
  const end = run.endedAt ? new Date(run.endedAt).getTime() : Date.now()
  return { ...run, durationMs: end - new Date(run.startedAt).getTime() }
}

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new HttpError(404, message)
  return value
}
