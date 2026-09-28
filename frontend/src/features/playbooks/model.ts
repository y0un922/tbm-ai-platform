import type { Playbook, PlaybookStage } from '@/types'

/** Legacy policies remain editable without silently changing their review requirement. */
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
