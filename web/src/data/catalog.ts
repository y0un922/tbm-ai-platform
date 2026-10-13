// Agent 配置与能力目录。已接入的条目与 server/spike/debate.ts 实际使用的提示词、工具、配额逐项对齐；
// 后端提供配置接口（建议 GET /api/agents、GET /api/tools）后改为从接口读取，本文件只保留类型
import { AGENTS, SPECIALISTS, type AgentId, type SpecialistId, type Stage } from '@tbm/shared'

export type CapStatus = 'live' | 'partial' | 'missing' | 'planned'
export type CapKind = 'data' | 'collab' | 'flow' | 'source' | 'mcp' | 'skill' | 'model'

export const STATUS_LABEL: Record<CapStatus, string> = { live: '已接入', partial: '部分接入', missing: '未接入', planned: '规划中' }
export const KIND_LABEL: Record<CapKind, string> = {
  data: '数据查询', collab: '协作', flow: '主持流程', source: '数据源', mcp: 'MCP', skill: 'Skill', model: '模型',
}

export interface Param {
  name: string
  type: string
  desc: string
}

export interface Capability {
  id: string
  name: string // 中文名
  kind: CapKind
  status: CapStatus
  desc: string
  owner?: string // 负责人 / 提供方
  agents: AgentId[] // 谁能用
  stages?: Stage[] // 哪些阶段可用（不填 = 全程）
  params?: Param[]
  quota?: string
  endpoint?: string
}

const RANGE: Param[] = [
  { name: 'ringFrom', type: 'number', desc: '起始环号，最小 500' },
  { name: 'ringTo', type: 'number', desc: '结束环号，最大 540' },
]
const BRIEF: Param = { name: 'brief', type: 'string', desc: '30 字以内的简短版本，用于画面显示' }
const ROLE_P: Param = { name: 'role', type: "'primary' | 'secondary' | 'ruled_out' | 'open'", desc: '主因 / 次因 / 排除 / 待定' }
const REFS = (name: string, desc: string): Param => ({ name, type: 'string[]', desc })

const SOLO_ON: Stage[] = ['solo', 'review', 'session']
const DEBATE: Stage[] = ['review', 'session']

export const CAPABILITIES: Capability[] = [
  // ---------- 数据查询：每位专家只能查自己的数据域 ----------
  { id: 'query_geology', name: '地质资料', kind: 'data', status: 'live', desc: '查询各环所处地层及卵石含量', agents: ['geology'], stages: SOLO_ON, params: RANGE, owner: '地质组' },
  { id: 'query_ring_metrics', name: '掘进参数', kind: 'data', status: 'live', desc: '查询各环推进速度(mm/min)、贯入度(mm/r)、刀盘转速(rpm)、刀盘扭矩(kN·m)、总推力(kN)', agents: ['boring'], stages: SOLO_ON, params: RANGE, owner: '设备组' },
  { id: 'query_cutter_wear', name: '刀盘监测', kind: 'data', status: 'live', desc: '查询各环刀具磨损速率(mm/环)和刀具温度(°C)，附磨损报警阈值 0.08 mm/环', agents: ['cutter'], stages: SOLO_ON, params: RANGE, owner: '设备组' },
  { id: 'query_foam', name: '泡沫系统', kind: 'data', status: 'live', desc: '查询各环泡沫原液流量(L/min)、发泡倍率、泡沫注入率 FIR', agents: ['muck'], stages: SOLO_ON, params: RANGE, owner: '设备组' },
  { id: 'query_muck_lab', name: '渣土实验室', kind: 'data', status: 'live', desc: '查询渣土坍落度(mm)，正常 150–200；只有取过样的环有数据', agents: ['muck'], stages: SOLO_ON, params: RANGE, owner: '试验室' },

  // ---------- 专家协作 ----------
  { id: 'post_finding', name: '发布判断', kind: 'collab', status: 'live', desc: '把判断发布到共享协作板，必须附证据编号', agents: [...SPECIALISTS], stages: SOLO_ON, params: [
    { name: 'claim', type: 'string', desc: '判断内容，一句话' }, BRIEF, ROLE_P, { name: 'confidence', type: 'number', desc: '0 到 1' }, REFS('evidence', '支持该判断的证据编号'),
  ] },
  { id: 'ask_human', name: '向现场提问', kind: 'collab', status: 'live', desc: '向现场施工人员提问系统里查不到的信息，回答成为现场证据 H*', agents: [...SPECIALISTS], stages: SOLO_ON, quota: '每人 1 次，全队 2 次', params: [
    { name: 'gap', type: 'enum', desc: '缺的是哪一项数据（取自数据快照的缺失项）' }, { name: 'question', type: 'string', desc: '问题' }, BRIEF,
  ] },
  { id: 'ask_peer', name: '向同伴提问', kind: 'collab', status: 'live', desc: '向另一位专家提问，对方查询自己的数据后回答', agents: [...SPECIALISTS], stages: DEBATE, quota: '每阶段 2 次', params: [
    { name: 'to', type: 'SpecialistId', desc: '被问的专家' }, { name: 'question', type: 'string', desc: '问题' }, BRIEF,
  ] },
  { id: 'read_board', name: '查看协作板', kind: 'collab', status: 'live', desc: '查看协作板上所有判断及其收到的质疑和赞同', agents: [...SPECIALISTS], stages: DEBATE, params: [] },
  { id: 'challenge', name: '质疑', kind: 'collab', status: 'live', desc: '质疑其他专家的判断，必须附上自己的证据', agents: [...SPECIALISTS], stages: DEBATE, params: [
    { name: 'findingId', type: 'string', desc: '被质疑的判断编号' }, { name: 'argument', type: 'string', desc: '理由' }, BRIEF, REFS('evidence', '反驳证据'),
  ] },
  { id: 'endorse', name: '赞同', kind: 'collab', status: 'live', desc: '赞同其他专家的判断，可补充证据', agents: [...SPECIALISTS], stages: DEBATE, params: [
    { name: 'findingId', type: 'string', desc: '被赞同的判断编号' }, { name: 'note', type: 'string', desc: '说明' }, BRIEF, REFS('evidence', '补充证据'),
  ] },
  { id: 'revise_finding', name: '修正判断', kind: 'collab', status: 'live', desc: '修改自己的判断，并注明采纳了谁的证据', agents: [...SPECIALISTS], stages: DEBATE, params: [
    { name: 'findingId', type: 'string', desc: '自己的判断编号' }, { name: 'claim', type: 'string', desc: '新判断' }, BRIEF, ROLE_P,
    { name: 'confidence', type: 'number', desc: '0 到 1' }, { name: 'reason', type: 'string', desc: '修改理由' }, REFS('cites', '促使修改的证据或判断编号'),
  ] },
  { id: 'defend', name: '坚持判断', kind: 'collab', status: 'live', desc: '回应质疑并坚持自己的判断，须给出新的理由或证据', agents: [...SPECIALISTS], stages: DEBATE, params: [
    { name: 'findingId', type: 'string', desc: '自己的判断编号' }, { name: 'argument', type: 'string', desc: '新理由' }, BRIEF, REFS('evidence', '新证据'),
  ] },
  { id: 'sign_off', name: '会签', kind: 'collab', status: 'live', desc: '对协调起草的结论会签：同意，或提出保留意见', agents: [...SPECIALISTS], stages: ['signoff'], params: [
    { name: 'agree', type: 'boolean', desc: '是否同意' }, { name: 'note', type: 'string?', desc: '保留意见，同意时可不填' },
  ] },

  // ---------- 协调主持 ----------
  { id: 'open_session', name: '发起专项会商', kind: 'flow', status: 'live', desc: '针对尚未解决的分歧发起专项会商，被质疑方须回应，其他参与者可补证', agents: ['coordinator'], stages: ['session'], quota: '最多 2 轮，顺序执行', params: [
    { name: 'topic', type: 'string', desc: '会商主题' }, { name: 'participants', type: 'SpecialistId[]', desc: '参会专家' }, REFS('findingIds', '涉及的判断编号'),
  ] },
  { id: 'close_session', name: '结束会商', kind: 'flow', status: 'live', desc: '宣布专项会商的结果', agents: ['coordinator'], stages: ['session'], params: [
    { name: 'sessionId', type: 'string', desc: '会商编号' }, { name: 'outcome', type: 'string', desc: '结果' },
  ] },
  { id: 'draft_conclusion', name: '起草结论', kind: 'flow', status: 'live', desc: '起草最终结论，每条原因都要引用协作板上的判断编号和证据编号', agents: ['coordinator'], stages: ['session'], params: [
    { name: 'primary', type: 'Cause', desc: '主因' }, { name: 'secondary', type: 'Cause[]', desc: '次因' }, { name: 'ruledOut', type: 'Cause[]', desc: '已排除' },
    { name: 'actions', type: 'string[]', desc: '建议措施（只给建议，不下发设备指令）' }, { name: 'dataGaps', type: 'string[]', desc: '数据缺口' },
  ] },

  // ---------- 数据源（数据快照的来源与缺口） ----------
  { id: 'src_geology', name: '地质资料', kind: 'source', status: 'live', desc: '地层划分与卵石含量，500–540 环', agents: ['geology'], owner: '地质组', endpoint: '场景数据 scenario.ts' },
  { id: 'src_ring', name: '掘进参数', kind: 'source', status: 'live', desc: '推进速度、贯入度、转速、扭矩、推力，逐环', agents: ['boring'], owner: '设备组', endpoint: '场景数据 scenario.ts' },
  { id: 'src_cutter', name: '刀盘监测', kind: 'source', status: 'live', desc: '刀具磨损速率与温度，逐环', agents: ['cutter'], owner: '设备组', endpoint: '场景数据 scenario.ts' },
  { id: 'src_foam', name: '泡沫系统', kind: 'source', status: 'live', desc: '原液流量、发泡倍率、注入率，逐环', agents: ['muck'], owner: '设备组', endpoint: '场景数据 scenario.ts' },
  { id: 'src_lab', name: '渣土实验室', kind: 'source', status: 'partial', desc: '坍落度试验，仅 519、526、533 环取过样', agents: ['muck'], owner: '试验室', endpoint: '场景数据 scenario.ts' },
  { id: 'src_alarm', name: '设备运行与报警记录', kind: 'source', status: 'missing', desc: '尚未接入；专家需要时只能通过「向现场提问」获得', agents: [] },
  { id: 'src_inspect', name: '开仓检查与换刀记录', kind: 'source', status: 'missing', desc: '尚未接入；专家需要时只能通过「向现场提问」获得', agents: [] },

  // ---------- MCP（规划） ----------
  { id: 'mcp_plc', name: 'TBM PLC 实时数据', kind: 'mcp', status: 'planned', desc: '通过 OPC UA / Modbus 读取盾构机 PLC 实时参数，替代场景数据', agents: ['boring', 'cutter', 'muck'], endpoint: 'opc.tcp://tbm-01:4840（待定）' },
  { id: 'mcp_alarm', name: '设备报警记录', kind: 'mcp', status: 'planned', desc: '查询设备运行日志与报警历史，补齐当前数据缺口', agents: ['cutter', 'muck'] },
  { id: 'mcp_workorder', name: '工单系统', kind: 'mcp', status: 'planned', desc: '查询开仓检查、换刀、检修工单；只读，不下发任何指令', agents: ['cutter'] },
  { id: 'mcp_geo_survey', name: '地勘数据库', kind: 'mcp', status: 'planned', desc: '查询详勘钻孔与超前地质预报', agents: ['geology'] },

  // ---------- Skill ----------
  { id: 'skill_efficiency', name: '掘进效率诊断会商', kind: 'skill', status: 'live', desc: '数据快照 → 背靠背研判 → 交叉互评 → 专项会商 → 结论会签 → 人工审核，本次演示的完整流程', agents: ['coordinator', ...SPECIALISTS] },
  { id: 'skill_foam', name: '渣土改良参数建议', kind: 'skill', status: 'planned', desc: '按地层与出土状态给出泡沫注入参数建议，供人工确认', agents: ['muck'] },
  { id: 'skill_cutter', name: '刀具更换计划', kind: 'skill', status: 'planned', desc: '结合磨损趋势与开仓记录建议换刀时机', agents: ['cutter'] },

  // ---------- 模型 ----------
  { id: 'model_deepseek', name: 'DeepSeek Flash', kind: 'model', status: 'live', desc: '所有 Agent 共用；思考强度 low；凭证由服务端读取，不进仓库', agents: ['coordinator', ...SPECIALISTS], endpoint: 'deepseek/deepseek-flash', owner: 'DeepSeek' },
]

// ---------- Agent 配置 ----------

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high'

export interface AgentConfig {
  id: Exclude<AgentId, 'human'>
  model: string
  thinkingLevel: ThinkingLevel
  systemPrompt: string
  tools: string[] // CAPABILITIES 中 kind 为 data / collab / flow 的 id
  mcp: string[]
  skills: string[]
  quotas: { askHuman: number; askPeerPerStage: number; sessions: number }
  stages: Stage[]
}

const ROLE: Record<SpecialistId, string> = {
  geology: '地质专家，负责判断地层条件对掘进的影响',
  boring: '掘进专家，负责分析掘进参数（速度、贯入度、扭矩、推力）及其变化原因',
  cutter: '刀盘专家，负责判断刀具磨损和刀盘状态',
  muck: '渣土改良专家，负责判断泡沫系统和渣土状态',
}

function specialistPrompt(id: SpecialistId) {
  return `你是盾构机 TBM-01 诊断会商中的${ROLE[id]}。
会商成员：地质、掘进、刀盘、渣土四位专家，以及一位协调主持人。你只能访问${AGENTS[id].dataDomain}的数据，其他专业的数据只能通过 ask_peer 问对应专家获得。

工作原则：
- 判断必须基于证据编号（E/H 开头），不得编造数据。
- 以本专业数据为准。同伴的判断与你的数据矛盾时，必须用 challenge 质疑并附证据，不要附和。
- 被同伴的证据说服时，用 revise_finding 修改自己的判断，并在 cites 中注明采纳了谁的证据。
- 关键判断依赖系统里查不到的现场信息时，可以用 ask_human 向现场提问（每人最多 1 次）。
- 发言简洁，用中文。每个协作工具都要求给出 30 字以内的 brief。`
}

const COLLAB = ['post_finding', 'ask_human', 'ask_peer', 'read_board', 'challenge', 'endorse', 'revise_finding', 'defend', 'sign_off']

function specialistConfig(id: SpecialistId): AgentConfig {
  return {
    id,
    model: 'deepseek/deepseek-flash',
    thinkingLevel: 'low',
    systemPrompt: specialistPrompt(id),
    tools: [...CAPABILITIES.filter((c) => c.kind === 'data' && c.agents.includes(id)).map((c) => c.id), ...COLLAB],
    mcp: [],
    skills: ['skill_efficiency'],
    quotas: { askHuman: 1, askPeerPerStage: 2, sessions: 0 },
    stages: ['solo', 'review', 'session', 'signoff'],
  }
}

export const DEFAULT_CONFIGS: Record<AgentConfig['id'], AgentConfig> = {
  coordinator: {
    id: 'coordinator',
    model: 'deepseek/deepseek-flash',
    thinkingLevel: 'low',
    systemPrompt: '你是 TBM-01 诊断会商的协调主持人。你不访问任何数据，只根据协作板组织讨论、形成结论。发言简洁，用中文。',
    tools: ['open_session', 'close_session', 'draft_conclusion'],
    mcp: [],
    skills: ['skill_efficiency'],
    quotas: { askHuman: 0, askPeerPerStage: 0, sessions: 2 },
    stages: ['session'],
  },
  geology: specialistConfig('geology'),
  boring: specialistConfig('boring'),
  cutter: specialistConfig('cutter'),
  muck: specialistConfig('muck'),
}

// pi-ai 内置的 DeepSeek 模型
export const MODELS = ['deepseek/deepseek-flash', 'deepseek/deepseek-v4-pro']
