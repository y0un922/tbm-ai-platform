export type SpecialistId = 'geology' | 'boring' | 'cutter' | 'muck'
export type AgentId = 'coordinator' | SpecialistId | 'human'

export const SPECIALISTS: SpecialistId[] = ['geology', 'boring', 'cutter', 'muck']

export interface AgentMeta {
  name: string
  role: string
  color: string // 角色色，画布、泳道、标签统一使用
  dataDomain?: string // 只有该 Agent 能访问的数据域
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  coordinator: { name: '协调', role: '会商主持人', color: '#22d3ee' },
  geology: { name: '地质', role: '地层条件', color: '#f59e0b', dataDomain: '地质资料' },
  boring: { name: '掘进', role: '掘进参数', color: '#3b82f6', dataDomain: '掘进参数' },
  cutter: { name: '刀盘', role: '刀具与刀盘状态', color: '#a855f7', dataDomain: '刀盘监测' },
  muck: { name: '渣土', role: '渣土改良', color: '#22c55e', dataDomain: '泡沫系统 / 渣土实验室' },
  human: { name: '现场', role: '现场施工人员', color: '#f8fafc' },
}

export const CHALLENGE_COLOR = '#ef4444'
