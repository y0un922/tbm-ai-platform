import type { Playbook, ReviewDecision, Run, RuntimeEvent, TriggerDefinition, TriggerInstance } from '@/types'
import { diagnosisScript, type ScriptStep } from '@/mocks/script'
import { applyEvent, store } from '@/mocks/store'
import { getPlaybookStages, validatePlaybook } from '@/features/playbooks/model'
import { playbookStageScript } from '@/mocks/playbookScript'

type Listener = (event: RuntimeEvent) => void
const listeners = new Map<string, Set<Listener>>()
// Mock-only continuation cursor, not a workflow scheduler.
const stageIndexes = new Map<string, number>()

function materialize(runId: string, steps: ScriptStep[], start: number): RuntimeEvent[] {
  const batch = crypto.randomUUID()
  return steps.map((step, i) => ({
    id: `${runId}_${batch}_${i}_${step.type}`,
    runId,
    type: step.type,
    timestamp: new Date(start + step.offsetMs).toISOString(),
    sourceId: step.sourceId,
    targetId: step.targetId,
    data: step.data,
  }))
}

export function publish(event: RuntimeEvent) {
  store.events.push(event)
  applyEvent(store, event)
  listeners.get(event.runId)?.forEach((listener) => listener(event))
}

export function subscribeRun(runId: string, listener: Listener) {
  let set = listeners.get(runId)
  if (!set) {
    set = new Set()
    listeners.set(runId, set)
  }
  set.add(listener)
  for (const event of store.events.filter((e) => e.runId === runId)) listener(event)
  return () => set!.delete(listener)
}

export function schedule(runId: string, steps: ScriptStep[], start = Date.now(), done?: () => void) {
  const events = materialize(runId, steps, start)
  for (const event of events) {
    const delay = Math.max(0, new Date(event.timestamp).getTime() - Date.now())
    setTimeout(() => {
      const run = store.runs.find((item) => item.id === runId)
      if (run?.playbook && (run.status === 'completed' || run.status === 'failed')) return
      publish(event)
      if (event === events.at(-1)) done?.()
    }, delay)
  }
}

function emit(run: Run, type: RuntimeEvent['type'], data: RuntimeEvent['data']) {
  publish({ id: `${run.id}_${crypto.randomUUID()}`, runId: run.id, type, timestamp: new Date().toISOString(), sourceId: 'coordinator', data })
}

function continuePlaybook(run: Run, index: number) {
  if (!run.playbook || run.status === 'completed' || run.status === 'failed') return
  const stage = run.playbook.stages[index]
  if (!stage) {
    stageIndexes.delete(run.id)
    emit(run, 'run.completed', { summary: `【Mock 模拟】${run.playbook.name} 的全部阶段已完成：${run.playbook.stages.map((item) => item.output).join('；')}。无外部调用，未向设备下发控制指令。` })
    return
  }
  stageIndexes.set(run.id, index)
  schedule(run.id, playbookStageScript(stage, run.id, store.agents), Date.now(), () => {
    if (!stage.requiresReview) continuePlaybook(run, index + 1)
  })
}

function firInstance(id: string): TriggerInstance {
  return {
    id,
    triggerDefinitionId: 'def_fir',
    type: 'metric_threshold',
    name: 'FIR 连续下降',
    source: 'SCADA',
    summary: 'FIR 连续第五环下降，触发异常诊断',
    timestamp: new Date().toISOString(),
    payload: { rule: '连续 5 环下降 > 20%', actual: '31%', threshold: '20%', metric: 'FIR', failed: false },
  }
}

export function createRun(input: { projectId: string; goal: string; demo?: 'fir' }): Run {
  const id = `run_${crypto.randomUUID()}`
  const trigger: TriggerInstance = input.demo === 'fir'
    ? firInstance(`ti_${id}`)
    : {
        id: `ti_${id}`,
        type: 'user_goal',
        name: input.goal.length > 18 ? `${input.goal.slice(0, 18)}…` : input.goal,
        source: '用户',
        summary: input.goal,
        timestamp: new Date().toISOString(),
        payload: { goal: input.goal, failed: false },
      }
  const run: Run = {
    id,
    projectId: input.projectId,
    status: 'pending',
    goal: input.goal,
    trigger,
    coordinatorId: 'coordinator',
    startedAt: new Date().toISOString(),
    participatingAgentIds: [],
    spawnedAgentIds: [],
    toolCallCount: 0,
    messageCount: 0,
    riskLevel: 'medium',
  }
  store.runs.unshift(run)
  store.instances.unshift(trigger)
  schedule(id, diagnosisScript(trigger, `rv_${id}`))
  return run
}

export function decideReview(runId: string, decision: ReviewDecision, reviewId?: string) {
  const run = store.runs.find((r) => r.id === runId)
  if (!['approve', 'reject', 'request_more_data'].includes(decision)) throw new Error('无效的审核决定')
  if (!run?.humanReview || run.status !== 'review' || run.humanReview.status !== 'pending' || (reviewId !== undefined && reviewId !== run.humanReview.id)) throw new Error('当前审核状态已变更，请刷新后重试')
  const index = stageIndexes.get(runId)
  const stage = index === undefined ? undefined : run.playbook?.stages[index]
  if (run.playbook && !stage) throw new Error('找不到待审核阶段，请刷新后重试')
  emit(run, 'human_review.decided', { reviewId: run.humanReview.id, stageId: stage?.id, decision })
  if (decision === 'approve') {
    if (stage) {
      emit(run, 'stage.completed', { stageId: stage.id, name: stage.name, summary: run.humanReview.result })
      continuePlaybook(run, index! + 1)
    } else {
      emit(run, 'run.completed', { summary: '人工审核已批准建议。结果已归档，未向设备下发控制指令。' })
    }
  } else if (decision === 'reject') {
    stageIndexes.delete(runId)
    emit(run, 'run.failed', { error: '人工审核驳回。运行结束，未向设备下发控制指令。' })
  } else {
    emit(run, 'agent.message', { agentId: 'coordinator', stageId: stage?.id, text: '已请求补充数据。Trigger Engine 与数据接入仍在后端，前端只记录审核决定。' })
  }
  return run
}

export function submitSupplement(runId: string, reviewId: string, content: string) {
  const run = store.runs.find((item) => item.id === runId)
  if (!run?.humanReview || run.status !== 'review' || run.humanReview.status !== 'needs_data' || run.humanReview.id !== reviewId) {
    throw new Error('当前运行不在待补数状态，请刷新后重试')
  }
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 5000) throw new Error('请填写 1–5000 字的补充材料')
  const review = run.humanReview
  // ponytail: mock only reopens review; backend must validate evidence before resuming execution.
  publish({
    id: `${runId}_supplement_${crypto.randomUUID()}`,
    runId,
    type: 'human_review.requested',
    timestamp: new Date().toISOString(),
    sourceId: 'coordinator',
    data: {
      ...review,
      reviewId: review.id,
      stageId: run.playbook?.stages[stageIndexes.get(runId) ?? -1]?.id,
      name: '补数后重新审核',
      reason: '已收到补充材料，请复核其真实性与适用范围。',
      supplement: content.trim(),
      input: { content: content.trim() },
    },
  })
  return run
}

function nextVersion(version: string) {
  const parts = /^\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : [1, 0, 0]
  parts[2] += 1
  return parts.join('.')
}

function checkProject(projectId: string, existingProjectId?: string) {
  if (!store.projects.some((project) => project.id === projectId)) throw new Error('项目不存在')
  if (existingProjectId && existingProjectId !== projectId) throw new Error('不能跨项目迁移配置')
}

/** Called only after validation: update both sides and detach previous partners atomically. */
function bindPlaybook(playbookId?: string, triggerId?: string) {
  for (const playbook of store.playbooks) {
    if (playbook.id !== playbookId && (!triggerId || playbook.triggerDefinitionId !== triggerId)) continue
    const next = playbook.id === playbookId ? triggerId : undefined
    if (playbook.triggerDefinitionId !== next) {
      playbook.triggerDefinitionId = next
      playbook.version = nextVersion(playbook.version)
      playbook.updatedAt = new Date().toISOString()
    }
  }
  for (const trigger of store.triggers) {
    if (trigger.id !== triggerId && (!playbookId || trigger.config.playbookId !== playbookId)) continue
    const next = trigger.id === triggerId ? playbookId : undefined
    trigger.config = { ...trigger.config }
    if (next) trigger.config.playbookId = next
    else delete trigger.config.playbookId
  }
}

export function savePlaybook(input: Partial<Playbook>, id?: string): Playbook {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('无效的 Playbook 配置')
  const existing = id ? store.playbooks.find((item) => item.id === id) : undefined
  if (id && !existing) throw new Error('Playbook 不存在')
  if (id && input.id !== undefined && input.id !== id) throw new Error('不能覆盖 Playbook id')
  const playbookId = id ?? input.id ?? `pb_${crypto.randomUUID()}`
  if (typeof playbookId !== 'string' || !playbookId.trim() || (!id && store.playbooks.some((item) => item.id === playbookId))) throw new Error('Playbook id 无效或已存在')
  const candidate: Playbook = structuredClone({
    projectId: '', name: '', status: 'testing', description: '', constraints: [],
    humanReview: { required: false, when: '', roles: [] },
    output: { description: '', destinations: [] }, notification: '', archiving: '',
    ...existing, ...input, id: playbookId,
    version: existing ? nextVersion(existing.version) : '1.0.0', updatedAt: new Date().toISOString(),
  })
  checkProject(candidate.projectId, existing?.projectId)
  if ([candidate.description, candidate.notification, candidate.archiving, candidate.output?.description, candidate.humanReview?.when].some((value) => typeof value !== 'string')
    || [candidate.constraints, candidate.output?.destinations, candidate.humanReview?.roles].some((value) => !Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    || typeof candidate.humanReview?.required !== 'boolean') throw new Error('无效的 Playbook 配置')
  const error = validatePlaybook(candidate, store.agents.map((agent) => agent.id))
  if (error) throw new Error(error)
  candidate.humanReview.required = getPlaybookStages(candidate).some((stage) => stage.requiresReview)
  if (candidate.triggerDefinitionId != null && typeof candidate.triggerDefinitionId !== 'string') throw new Error('无效的 Trigger 绑定')
  candidate.triggerDefinitionId = candidate.triggerDefinitionId || undefined
  if (candidate.triggerDefinitionId) {
    const trigger = store.triggers.find((item) => item.id === candidate.triggerDefinitionId)
    if (!trigger || trigger.projectId !== candidate.projectId) throw new Error('绑定的 Trigger 不存在或项目不一致')
  }
  if (existing) Object.assign(existing, candidate)
  else store.playbooks.unshift(candidate)
  bindPlaybook(playbookId, candidate.triggerDefinitionId)
  return existing ?? candidate
}

export function saveTrigger(input: TriggerDefinition, id = input?.id) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !id || input.id !== id) throw new Error('不能覆盖 Trigger id')
  const existing = store.triggers.find((t) => t.id === id)
  checkProject(input.projectId, existing?.projectId)
  if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) throw new Error('无效的 Trigger 配置')
  const playbookId = input.config.playbookId
  if (playbookId != null && typeof playbookId !== 'string') throw new Error('无效的 Playbook 绑定')
  if (playbookId) {
    const playbook = store.playbooks.find((item) => item.id === playbookId)
    if (!playbook || playbook.projectId !== input.projectId) throw new Error('绑定的 Playbook 不存在或项目不一致')
  }
  const candidate = structuredClone(input)
  if (existing) Object.assign(existing, candidate)
  else store.triggers.unshift(candidate)
  bindPlaybook(typeof playbookId === 'string' ? playbookId || undefined : undefined, id)
  return existing ?? candidate
}

function savedPlayable(id: string, projectId?: string): Playbook {
  const playbook = store.playbooks.find((item) => item.id === id)
  if (!playbook) throw new Error('Playbook 不存在')
  if (projectId && projectId !== playbook.projectId) throw new Error('Playbook 项目不一致')
  if (playbook.status === 'disabled') throw new Error('停用的 Playbook 不能测试')
  const error = validatePlaybook(playbook, store.agents.map((agent) => agent.id))
  if (error) throw new Error(error)
  return playbook
}

export function testPlaybook(id: string) {
  const playbook = savedPlayable(id)
  const trigger: TriggerInstance = {
    id: `ti_${crypto.randomUUID()}`, type: 'manual', name: `测试工作流：${playbook.name}`,
    source: 'Mock 手动测试', summary: playbook.description || playbook.name,
    timestamp: new Date().toISOString(), payload: { test: true, mock: true },
  }
  return startTriggeredRun(trigger, playbook.projectId, playbook)
}

export function testTrigger(id: string) {
  const def = store.triggers.find((t) => t.id === id)
  if (!def) throw new Error('找不到 Trigger')
  if (!def.enabled) throw new Error('停用的 Trigger 不能测试')
  const runId = `run_${crypto.randomUUID()}`
  const trigger: TriggerInstance = {
    id: `ti_${runId}`,
    triggerDefinitionId: def.id,
    type: def.type,
    name: def.name,
    source: String(def.config.source ?? '测试'),
    summary: `测试触发：${def.name}`,
    timestamp: new Date().toISOString(),
    payload: { rule: def.config.condition, actual: '测试值', threshold: String(def.config.condition ?? '—'), failed: false, test: true },
  }
  const playbook = def.config.playbookId ? savedPlayable(String(def.config.playbookId), def.projectId) : undefined
  return startTriggeredRun(trigger, def.projectId, playbook)
}

function startTriggeredRun(trigger: TriggerInstance, projectId: string, playbook?: Playbook): Run {
  const run: Run = {
    id: `run_${crypto.randomUUID()}`,
    projectId,
    status: 'pending',
    goal: trigger.summary,
    trigger,
    coordinatorId: 'coordinator',
    startedAt: trigger.timestamp,
    participatingAgentIds: [],
    spawnedAgentIds: [],
    toolCallCount: 0,
    messageCount: 0,
    riskLevel: 'medium',
  }
  store.runs.unshift(run)
  store.instances.unshift(trigger)
  if (playbook) {
    run.playbook = structuredClone({ id: playbook.id, name: playbook.name, version: playbook.version, stages: getPlaybookStages(playbook) })
    schedule(run.id, [
      { offsetMs: 0, type: 'trigger.fired', data: { instanceId: trigger.id, name: trigger.name, triggerType: trigger.type, source: trigger.source, summary: trigger.summary, payload: trigger.payload } },
      { offsetMs: 40, type: 'run.started', data: { goal: run.goal, mock: true } },
      { offsetMs: 100, type: 'coordinator.started', data: { agentId: 'coordinator', name: 'Coordinator', mock: true } },
    ], Date.now(), () => continuePlaybook(run, 0))
  } else schedule(run.id, diagnosisScript(trigger, `rv_${run.id}`))
  return run
}

export function startDemo() {
  if (store.demoStarted || store.runs.some((r) => r.id === 'run_fir_demo')) {
    store.demoStarted = true
    return
  }
  store.demoStarted = true
  const trigger = firInstance('ti_fir_demo')
  trigger.timestamp = new Date().toISOString()
  const run: Run = {
    id: 'run_fir_demo',
    projectId: 'proj_a',
    status: 'pending',
    goal: '解释 FIR 连续下降原因，并给出掘进参数建议',
    trigger,
    coordinatorId: 'coordinator',
    startedAt: new Date().toISOString(),
    participatingAgentIds: [],
    spawnedAgentIds: [],
    toolCallCount: 0,
    messageCount: 0,
    riskLevel: 'high',
  }
  store.runs.unshift(run)
  store.instances.unshift(trigger)
  schedule(run.id, diagnosisScript(trigger, 'rv_fir_demo'))
}

startDemo()
