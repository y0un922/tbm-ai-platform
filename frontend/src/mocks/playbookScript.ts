import type { AgentRecord, PlaybookStage } from '@/types'
import type { ScriptStep } from '@/mocks/script'

/** Mock collaboration only: no model, tool, API or equipment calls. */
export function playbookStageScript(stage: PlaybookStage, runId: string, agents: AgentRecord[]): ScriptStep[] {
  const steps: ScriptStep[] = []
  const data = { stageId: stage.id, goal: stage.goal, expectedOutput: stage.output, mock: true }
  const add = (type: ScriptStep['type'], detail: Record<string, unknown>, sourceId = 'coordinator', targetId?: string) => {
    steps.push({ offsetMs: steps.length * 200, type, sourceId, targetId, data: { ...data, ...detail } })
  }
  // ponytail: autonomous selection uses Coordinator only; real selection belongs to the backend.
  const agentIds = stage.agentIds.length ? stage.agentIds : ['coordinator']
  add('stage.started', { name: stage.name, agentIds })
  add('agent.message', { agentId: 'coordinator', text: `【Mock 模拟，无外部调用】阶段目标：${stage.goal}；预期输出：${stage.output}。${stage.agentIds.length ? '按配置组织协作。' : '自主选择由 Coordinator 执行。'}` })
  for (const agentId of agentIds) {
    add('agent.delegated', { agentId, name: agents.find((agent) => agent.id === agentId)?.name ?? agentId }, 'coordinator', agentId)
    add('agent.started', { agentId }, agentId)
  }
  const result = `【Mock 模拟输出，非真实工程结论】围绕“${stage.goal}”生成“${stage.output}”；仅供流程演示，无外部调用，未向设备下发控制指令。`
  for (const agentId of agentIds) {
    add('agent.message', { agentId, to: 'coordinator', text: result }, agentId, 'coordinator')
    add('agent.completed', { agentId, summary: result, output: result }, agentId)
  }
  if (stage.requiresReview) {
    add('human_review.requested', {
      reviewId: `rv_${runId}_${stage.id}`,
      name: `${stage.name} · 阶段审核`,
      agentId: 'coordinator',
      reason: '本阶段要求人工审核；批准前不会启动下一阶段。',
      result,
      risk: '模拟数据未经现场核验，不可用于施工决策。',
      missing: ['真实现场证据与输出适用性核验'],
      recommendation: '审核模拟输出后继续下一阶段；补数仅重新开启审核，不自动放行。',
    })
  } else add('stage.completed', { name: stage.name, summary: result, output: result })
  return steps
}
