import { Type } from '@earendil-works/pi-ai'
import { defineTool } from '@earendil-works/pi-coding-agent'
import type { Playbook, ReviewDecision, Run, RuntimeEvent, TriggerDefinition, TriggerInstance } from '../../frontend/src/types/index.ts'
import { runPiAgent, specialistTools } from './pi.ts'
import { bindScene, firDropPct, rings } from './rings.ts'
import {
  applyEvent,
  emptyEvidence,
  getPlaybookStages,
  HttpError,
  PARTITION,
  required,
  store,
  validatePlaybook,
} from './store.ts'

type Listener = (event: RuntimeEvent) => void
const listeners = new Map<string, Set<Listener>>()
const running = new Set<string>()

export function publish(event: RuntimeEvent) {
  store.events.push(event)
  applyEvent(event)
  listeners.get(event.runId)?.forEach((listener) => listener(event))
}

export function subscribeRun(runId: string, listener: Listener) {
  let set = listeners.get(runId)
  if (!set) {
    set = new Set()
    listeners.set(runId, set)
  }
  set.add(listener)
  for (const event of store.events.filter((item) => item.runId === runId)) listener(event)
  return () => set!.delete(listener)
}

function emit(run: Run, type: RuntimeEvent['type'], data: Record<string, unknown>, extra?: { sourceId?: string; targetId?: string }) {
  publish({
    id: `${run.id}_${crypto.randomUUID()}`,
    runId: run.id,
    type,
    timestamp: new Date().toISOString(),
    sourceId: extra?.sourceId,
    targetId: extra?.targetId,
    data,
  })
}

function nextVersion(version: string) {
  const parts = /^\d+\.\d+\.\d+$/.test(version) ? version.split('.').map(Number) : [1, 0, 0]
  parts[2] += 1
  return parts.join('.')
}

function checkProject(projectId: string, existing?: string) {
  if (!store.projects.some((project) => project.id === projectId)) throw new HttpError(400, '项目不存在')
  if (existing && existing !== projectId) throw new HttpError(400, '不能跨项目迁移配置')
}

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

function snapshot(playbook: Playbook) {
  return { id: playbook.id, name: playbook.name, version: playbook.version, stages: getPlaybookStages(playbook) }
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

function skipPi() {
  return process.env.TBM_NO_PI === '1'
}

function agentById(id: string) {
  return required(store.agents.find((item) => item.id === id), `Agent ${id} 不存在`)
}

async function runAgent(run: Run, stageId: string, agentId: string, prompt: string, extraTools?: Parameters<typeof runPiAgent>[0]['extraTools'], task?: string) {
  const agent = agentById(agentId)
  if (agentId !== 'coordinator') {
    emit(run, 'agent.delegated', { agentId, name: agent.name, role: agent.role, stageId, task: task || agent.role }, { sourceId: 'coordinator', targetId: agentId })
  }
  emit(run, 'agent.started', { agentId, stageId }, { sourceId: agentId, targetId: agentId })
  try {
    if (skipPi()) {
      emit(run, 'agent.message', { agentId, stageId, to: agentId === 'coordinator' ? undefined : 'coordinator', text: `【TBM_NO_PI】${prompt.slice(0, 180)}` }, { sourceId: agentId, targetId: agentId === 'coordinator' ? undefined : 'coordinator' })
      if (agentId !== 'coordinator') {
        const partition = agentId === 'c1' ? 'geology' : agentId === 'c6' ? 'muck' : agentId === 'c3' ? 'cutterhead' : 'tunneling'
        const ev = store.evidence[run.id] ?? (store.evidence[run.id] = emptyEvidence())
        ev[partition].push({ agentId, partition, summary: `剧本证据：${stageId}`, timestamp: new Date().toISOString() })
      } else {
        const ev = store.evidence[run.id] ?? (store.evidence[run.id] = emptyEvidence())
        ev.conclusion = { text: `剧本结论：${stageId}`, reason: 'TBM_NO_PI', risk: '模拟', missing: [], recommendation: '批准为演示建议。平台不向 PLC 下发。' }
      }
    } else {
      await runPiAgent({
        agent,
        runId: run.id,
        stageId,
        prompt,
        extraTools,
        emit: (type, data, extra) => emit(run, type, data, extra),
      })
    }
    const ev = store.evidence[run.id]
    const part = PARTITION[agentId]
    const summary = agentId === 'coordinator'
      ? (ev?.conclusion?.text ?? `${agent.name} 已完成`)
      : (part && ev?.[part].at(-1)?.summary) || `${agent.name} 已完成`
    emit(run, 'agent.completed', { agentId, stageId, summary }, { sourceId: agentId })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emit(run, 'agent.failed', { agentId, stageId, error: message }, { sourceId: agentId })
    throw error
  }
}

async function runCoordinatorStage(run: Run, stageId: string, stage: NonNullable<Run['playbook']>['stages'][number], allowed: string[]) {
  let delegates = 0
  const roster = allowed.map((id) => {
    const agent = agentById(id)
    return `${agent.id} ${agent.name}：${agent.description}`
  }).join('\n')
  const cap = stage.id.includes('verify') ? 1 : 2
  const delegate = defineTool({
    name: 'delegate',
    label: '委派',
    description: `每次只委派一个最相关的专业 Agent。看完结果再决定要不要再问。本阶段最多 ${cap} 次。禁止一次点名多人。`,
    parameters: Type.Object({
      agentId: Type.String({ description: `可选：${allowed.join(', ')}` }),
      task: Type.String({ description: '给该 Agent 的具体任务' }),
    }),
    executionMode: 'sequential',
    async execute(_id, params) {
      if (!allowed.includes(params.agentId)) throw new Error(`不能委派 ${params.agentId}`)
      if (++delegates > cap) throw new Error(`本阶段最多委派 ${cap} 个 Agent`)
      await runAgent(run, stageId, params.agentId, [
        `用户任务：${run.goal}`,
        `Coordinator 委派：${params.task}`,
        '先调用工具取数，再 write_evidence。只回答被问到的问题，不要自动改写成 FIR 诊断。',
        `可用工具：${specialistTools(params.agentId).join(', ')}。`,
        '不要编造未出现在工具结果里的数字。禁止 PLC 指令。',
      ].join('\n'), undefined, params.task)
      const ev = store.evidence[run.id] ?? emptyEvidence()
      const part = PARTITION[params.agentId]
      const latest = part ? ev[part].at(-1) : undefined
      return { content: [{ type: 'text', text: JSON.stringify(latest ?? { ok: true }) }], details: latest }
    },
  })
  await runAgent(run, stageId, 'coordinator', [
    `用户任务：${run.goal}`,
    '只回答用户任务。阶段只是审核/验证门，不要改写成 FIR 诊断，除非用户在问效率下降。',
    `当前阶段 ${stage.name}。送审：${stage.requiresReview ? '分析后必须 request_review' : 'write_conclusion 即可'}。`,
    '调度规则：先只委派 1 个最相关 Agent；不够再补 1 个。禁止把名单走一遍，禁止一次并行点多人。',
    '对照：泡沫/渣土→c6；地层/含水→c1；掘进参数/FIR/推力→c2；刀盘磨损→c3。无关的不要派。',
    `可委派：\n${roster}`,
    `当前证据：${JSON.stringify(store.evidence[run.id] ?? emptyEvidence())}`,
  ].join('\n'), [delegate])
}

async function executeStage(run: Run, index: number) {
  const stage = run.playbook?.stages[index]
  if (!stage) {
    delete store.stageIndex[run.id]
    const done = store.evidence[run.id]?.conclusion?.text || run.humanReview?.result || '运行已完成。未向设备下发控制指令。'
    emit(run, 'run.completed', { summary: done })
    return
  }
  store.stageIndex[run.id] = index
  const pool = stage.agentIds.length ? stage.agentIds : ['c1', 'c2', 'c3', 'c6']
  const allowed = pool.filter((id) => id !== 'coordinator' && (id !== 'c4' || run.goal.includes('管片')))
  emit(run, 'stage.started', { stageId: stage.id, name: stage.name, goal: stage.goal, agentIds: allowed, autonomous: true })
  try {
    await runCoordinatorStage(run, stage.id, stage, allowed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emit(run, 'run.failed', { error: message })
    return
  }
  if (stage.requiresReview) {
    const conclusion = store.evidence[run.id]?.conclusion
    emit(run, 'human_review.requested', {
      reviewId: `rv_${run.id}_${stage.id}`,
      stageId: stage.id,
      name: `${stage.name} · 阶段审核`,
      agentId: 'coordinator',
      reason: conclusion?.reason || '参数建议超出自动执行范围，需人工确认。',
      result: conclusion?.text || 'Coordinator 已汇总专业证据。',
      risk: conclusion?.risk || '中。现场未核验前不得施工决策。',
      missing: conclusion?.missing?.length ? conclusion.missing : ['现场含水率复核', '泡沫系统压力曲线核验'],
      recommendation: conclusion?.recommendation || '批准为施工建议。平台不向 PLC 下发控制指令。',
    }, { sourceId: 'coordinator' })
    return
  }
  emit(run, 'stage.completed', { stageId: stage.id, name: stage.name, summary: store.evidence[run.id]?.conclusion?.text || stage.output })
  await executeStage(run, index + 1)
}

async function kick(run: Run, index: number) {
  if (running.has(run.id)) return
  running.add(run.id)
  try {
    await executeStage(run, index)
  } finally {
    running.delete(run.id)
  }
}

function startRun(trigger: TriggerInstance, projectId: string, playbook: Playbook | undefined, goal: string): Run {
  const run = blankRun({
    id: `run_${crypto.randomUUID()}`,
    projectId,
    goal,
    trigger,
    startedAt: trigger.timestamp,
    playbook: playbook ? snapshot(playbook) : undefined,
    riskLevel: 'high',
  })
  store.runs.unshift(run)
  store.instances.unshift(trigger)
  store.evidence[run.id] = emptyEvidence()
  const scene = bindScene(run.id, trigger.triggerDefinitionId === 'def_fir' ? 'fir' : 'random')
  if (trigger.payload && typeof trigger.payload === 'object') {
    trigger.payload = { ...trigger.payload, scene, window: rings(1246, 1250, run.id), actual: `${firDropPct(1246, 1250, run.id)}%` }
  }
  emit(run, 'trigger.fired', {
    instanceId: trigger.id,
    definitionId: trigger.triggerDefinitionId,
    name: trigger.name,
    triggerType: trigger.type,
    source: trigger.source,
    summary: trigger.summary,
    payload: trigger.payload ?? {},
  }, { targetId: trigger.id })
  emit(run, 'run.started', { goal, playbook: run.playbook })
  emit(run, 'coordinator.started', { agentId: 'coordinator', name: 'Coordinator' }, { sourceId: trigger.id })
  void kick(run, 0)
  return run
}

function savedPlayable(id: string, projectId?: string): Playbook {
  const playbook = required(store.playbooks.find((item) => item.id === id), 'Playbook 不存在')
  if (projectId && projectId !== playbook.projectId) throw new HttpError(400, 'Playbook 项目不一致')
  if (playbook.status === 'disabled') throw new HttpError(400, '停用的 Playbook 不能测试')
  const error = validatePlaybook(playbook, store.agents.map((item) => item.id))
  if (error) throw new HttpError(400, error)
  return playbook
}

export function firInstance(id: string): TriggerInstance {
  return {
    id,
    triggerDefinitionId: 'def_fir',
    type: 'metric_threshold',
    name: 'FIR 连续下降',
    source: 'SCADA',
    summary: `FIR 连续第五环下降 ${firDropPct()}%，触发异常诊断`,
    timestamp: new Date().toISOString(),
    payload: { rule: '连续 5 环下降 > 20%', actual: `${firDropPct()}%`, threshold: '20%', metric: 'FIR', ring: 1250, window: rings(), failed: false },
  }
}

export function createRun(input: { projectId: string; goal: string; demo?: 'fir' }): Run {
  checkProject(input.projectId)
  const playbook = store.playbooks.find((item) => item.id === 'pb_eff' && item.projectId === input.projectId && item.status !== 'disabled')
  const trigger: TriggerInstance = input.demo === 'fir'
    ? firInstance(`ti_${crypto.randomUUID()}`)
    : {
        id: `ti_${crypto.randomUUID()}`,
        type: 'user_goal',
        name: input.goal.length > 18 ? `${input.goal.slice(0, 18)}…` : input.goal,
        source: '用户',
        summary: input.goal,
        timestamp: new Date().toISOString(),
        payload: { goal: input.goal, failed: false },
      }
  return startRun(trigger, input.projectId, playbook, input.goal)
}

export function testPlaybook(id: string) {
  const playbook = savedPlayable(id)
  const trigger: TriggerInstance = {
    id: `ti_${crypto.randomUUID()}`,
    type: 'manual',
    name: `测试工作流：${playbook.name}`,
    source: '手动测试',
    summary: playbook.description || playbook.name,
    timestamp: new Date().toISOString(),
    payload: { test: true },
  }
  return startRun(trigger, playbook.projectId, playbook, trigger.summary)
}

export function testTrigger(id: string) {
  const def = required(store.triggers.find((item) => item.id === id), '找不到 Trigger')
  if (!def.enabled) throw new HttpError(400, '停用的 Trigger 不能测试')
  if (def.type === 'metric_threshold' && def.id === 'def_fir' && firDropPct() <= 20) {
    throw new HttpError(400, '当前环序列未达到 FIR 连续下降阈值')
  }
  const playbook = def.config.playbookId ? savedPlayable(String(def.config.playbookId), def.projectId) : undefined
  const trigger: TriggerInstance = def.id === 'def_fir'
    ? firInstance(`ti_${crypto.randomUUID()}`)
    : {
        id: `ti_${crypto.randomUUID()}`,
        triggerDefinitionId: def.id,
        type: def.type,
        name: def.name,
        source: String(def.config.source ?? '测试'),
        summary: `测试触发：${def.name}`,
        timestamp: new Date().toISOString(),
        payload: { rule: def.config.condition, actual: '测试值', threshold: String(def.config.condition ?? '—'), failed: false, test: true },
      }
  return startRun(trigger, def.projectId, playbook, trigger.summary)
}

export function decideReview(runId: string, decision: ReviewDecision, reviewId?: string) {
  if (!['approve', 'reject', 'request_more_data'].includes(decision)) throw new HttpError(400, '无效的审核决定')
  const run = required(store.runs.find((item) => item.id === runId), '运行不存在')
  if (!run.humanReview || run.status !== 'review' || run.humanReview.status !== 'pending' || (reviewId !== undefined && reviewId !== run.humanReview.id)) {
    throw new HttpError(409, '当前审核状态已变更，请刷新后重试')
  }
  const index = store.stageIndex[runId]
  const stage = index === undefined ? undefined : run.playbook?.stages[index]
  if (run.playbook && !stage) throw new HttpError(409, '找不到待审核阶段，请刷新后重试')
  emit(run, 'human_review.decided', { reviewId: run.humanReview.id, stageId: stage?.id, decision })
  if (decision === 'approve') {
    if (stage) {
      emit(run, 'stage.completed', { stageId: stage.id, name: stage.name, summary: run.humanReview.result })
      void kick(run, index! + 1)
    } else {
      emit(run, 'run.completed', { summary: '人工审核已批准建议。结果已归档，未向设备下发控制指令。' })
    }
  } else if (decision === 'reject') {
    delete store.stageIndex[runId]
    emit(run, 'run.failed', { error: '人工审核驳回。运行结束，未向设备下发控制指令。' })
  } else {
    emit(run, 'agent.message', { agentId: 'coordinator', stageId: stage?.id, text: '已请求补充数据。补数后重新送审，不自动批准。' })
  }
  return run
}

export function submitSupplement(runId: string, reviewId: string, content: string) {
  const run = required(store.runs.find((item) => item.id === runId), '运行不存在')
  if (!run.humanReview || run.status !== 'review' || run.humanReview.status !== 'needs_data' || run.humanReview.id !== reviewId) {
    throw new HttpError(409, '当前运行不在待补数状态，请刷新后重试')
  }
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 5000) throw new HttpError(400, '请填写 1–5000 字的补充材料')
  const review = run.humanReview
  const stageId = run.playbook?.stages[store.stageIndex[runId] ?? -1]?.id
  emit(run, 'human_review.requested', {
    ...review,
    reviewId: review.id,
    stageId,
    name: '补数后重新审核',
    reason: '已收到补充材料，请复核其真实性与适用范围。',
    supplement: content.trim(),
    input: { content: content.trim() },
  }, { sourceId: 'coordinator' })
  return run
}

export function savePlaybook(input: Partial<Playbook>, id?: string): Playbook {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, '无效的 Playbook 配置')
  const existing = id ? store.playbooks.find((item) => item.id === id) : undefined
  if (id && !existing) throw new HttpError(404, 'Playbook 不存在')
  if (id && input.id !== undefined && input.id !== id) throw new HttpError(400, '不能覆盖 Playbook id')
  const playbookId = id ?? input.id ?? `pb_${crypto.randomUUID()}`
  if (typeof playbookId !== 'string' || !playbookId.trim() || (!id && store.playbooks.some((item) => item.id === playbookId))) throw new HttpError(400, 'Playbook id 无效或已存在')
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
    || typeof candidate.humanReview?.required !== 'boolean') throw new HttpError(400, '无效的 Playbook 配置')
  const error = validatePlaybook(candidate, store.agents.map((item) => item.id))
  if (error) throw new HttpError(400, error)
  candidate.humanReview.required = getPlaybookStages(candidate).some((stage) => stage.requiresReview)
  if (candidate.triggerDefinitionId != null && typeof candidate.triggerDefinitionId !== 'string') throw new HttpError(400, '无效的 Trigger 绑定')
  candidate.triggerDefinitionId = candidate.triggerDefinitionId || undefined
  if (candidate.triggerDefinitionId) {
    const trigger = store.triggers.find((item) => item.id === candidate.triggerDefinitionId)
    if (!trigger || trigger.projectId !== candidate.projectId) throw new HttpError(400, '绑定的 Trigger 不存在或项目不一致')
  }
  if (existing) Object.assign(existing, candidate)
  else store.playbooks.unshift(candidate)
  bindPlaybook(playbookId, candidate.triggerDefinitionId)
  return existing ?? candidate
}

export function saveTrigger(input: TriggerDefinition, id = input?.id) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !id || input.id !== id) throw new HttpError(400, '不能覆盖 Trigger id')
  const existing = store.triggers.find((item) => item.id === id)
  checkProject(input.projectId, existing?.projectId)
  if (!input.config || typeof input.config !== 'object' || Array.isArray(input.config)) throw new HttpError(400, '无效的 Trigger 配置')
  const playbookId = input.config.playbookId
  if (playbookId != null && typeof playbookId !== 'string') throw new HttpError(400, '无效的 Playbook 绑定')
  if (playbookId) {
    const playbook = store.playbooks.find((item) => item.id === playbookId)
    if (!playbook || playbook.projectId !== input.projectId) throw new HttpError(400, '绑定的 Playbook 不存在或项目不一致')
  }
  const candidate = structuredClone(input)
  if (existing) Object.assign(existing, candidate)
  else store.triggers.unshift(candidate)
  bindPlaybook(typeof playbookId === 'string' ? playbookId || undefined : undefined, id)
  return existing ?? candidate
}

export function patchAgent(id: string, body: Partial<import('../../frontend/src/types/index.ts').AgentRecord>) {
  const agent = required(store.agents.find((item) => item.id === id), 'Agent 不存在')
  const { runtimeTools: _drop, ...rest } = body
  Object.assign(agent, rest, { updatedAt: new Date().toISOString() })
  return { ...agent, runtimeTools: specialistTools(agent.id) }
}
