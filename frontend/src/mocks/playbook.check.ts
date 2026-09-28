// Run: npx tsx src/mocks/playbook.check.ts
import assert from 'node:assert/strict'
import { mock } from 'node:test'
import type { Playbook, PlaybookStage, Run, TriggerDefinition } from '@/types'
import { applyEvent, store } from './store'
import { getPlaybookStages } from '@/features/playbooks/model'
import { reduceGraph } from '@/features/runtime/graphReducer'

store.demoStarted = true
mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
const { mockRequest } = await import('./router')
const request = <T>(path: string, method = 'POST', body?: unknown) => mockRequest<T>(path, { method, body })
const save = (id: string, body: unknown) => request<Playbook>(`/playbooks/${id}`, 'PATCH', body)
const test = (id: string, body?: unknown) => request<Run>(`/playbooks/${id}/test`, 'POST', body)
const decide = (run: Run, decision: string) => request<Run>(`/runs/${run.id}/review`, 'POST', { decision })
const events = (run: Run) => store.events.filter((event) => event.runId === run.id)
const starts = (run: Run) => events(run).filter((event) => event.type === 'stage.started').map((event) => event.data.stageId)
const advance = (ms = 10000) => { for (let elapsed = 0; elapsed < ms; elapsed += 100) mock.timers.tick(100) }
const stage = (id: string, agentIds: string[], requiresReview: boolean): PlaybookStage => ({ id, name: `阶段 ${id}`, goal: `目标 ${id}`, output: `输出 ${id}`, agentIds, requiresReview })
const stages = [stage('z', ['c6', 'c2'], false), stage('a', ['c1'], true), stage('m', [], true), stage('tail', ['c4'], false)]
const base = structuredClone(store.playbooks[0])
const draft = { ...base, id: 'pb_check', triggerDefinitionId: undefined, name: '阶段闭环检查', status: 'testing', stages }

function assertBindings() {
  for (const playbook of store.playbooks) {
    if (playbook.triggerDefinitionId) {
      const trigger = store.triggers.find((item) => item.id === playbook.triggerDefinitionId)!
      assert.equal(trigger.config.playbookId, playbook.id)
      assert.equal(trigger.projectId, playbook.projectId)
    }
  }
  for (const trigger of store.triggers) {
    if (trigger.config.playbookId) assert.equal(store.playbooks.find((item) => item.id === trigger.config.playbookId)?.triggerDefinitionId, trigger.id)
  }
}

try {
  assertBindings()
  const playbook = await request<Playbook>('/playbooks', 'POST', draft)
  assert.equal(playbook.version, '1.0.0')
  draft.stages[0].name = '未保存的修改'
  assert.equal(playbook.stages![0].name, '阶段 z', 'saving must detach request data')
  const saved = structuredClone(playbook)
  for (const patch of [
    { id: 'pb_eff' }, { projectId: 'proj_b' }, { name: ' ' }, { name: 'x'.repeat(101) }, { status: 'bad' },
    { constraints: null }, { humanReview: { required: true, roles: 'bad', when: '' } }, { output: { description: '' } },
    { stages: Array.from({ length: 21 }, (_, index) => stage(String(index), [], false)) },
    { stages: [] }, { stages: [stages[1], stages[1]] },
    { stages: [stage('bad', ['unknown'], false)] }, { stages: [stage('bad', ['c1', 'c1'], false)] },
    { stages: [{ ...stages[1], requiresReview: 'yes' }] }, { stages: [{ ...stages[1], goal: '' }] },
    { stages: [{ ...stages[1], output: '' }] }, { triggerDefinitionId: 'missing' },
  ]) {
    await assert.rejects(save(playbook.id, patch))
    assert.deepEqual(playbook, saved, 'invalid saves must be atomic')
  }
  await assert.rejects(request('/playbooks', 'POST', draft), /已存在/)
  await assert.rejects(request('/playbooks', 'POST', { ...draft, id: 'bad_project', projectId: 'missing' }), /项目/)
  await assert.rejects(test('missing'), /不存在/)
  await assert.rejects(test('pb_segment'), /停用/)

  const run = await test(playbook.id, { stages: [] }) // Unsaved request payload is intentionally ignored.
  assert.deepEqual(run.playbook?.stages, saved.stages)
  assert.equal(run.playbook?.version, '1.0.0')
  advance()
  assert.equal(run.status, 'review')
  assert.deepEqual(starts(run), ['z', 'a'], 'stage order comes from array, not id sorting')
  assert.deepEqual(run.participatingAgentIds, ['c6', 'c2', 'c1'])
  assert.equal(run.toolCallCount, 0)
  for (const event of events(run).filter((event) => event.type.startsWith('stage.'))) assert.equal(event.data.name, `阶段 ${event.data.stageId}`)
  const outputs = events(run).filter((event) => event.type === 'agent.completed')
  assert.ok(outputs.every((event) => String(event.data.summary).includes(`目标 ${event.data.stageId}`) && String(event.data.summary).includes(`输出 ${event.data.stageId}`) && String(event.data.summary).includes('Mock')))
  assert.deepEqual(events(run).filter((event) => event.type === 'stage.completed').map((event) => event.data.stageId), ['z'])
  const count = events(run).length
  advance()
  assert.equal(events(run).length, count, 'review must block even after all timers drain')

  await save(playbook.id, { version: '99.0.0', name: '新定义', stages: [stage('replacement', ['c3'], false)] })
  assert.equal(playbook.version, '1.0.1', 'client cannot override server version')
  assert.equal(playbook.humanReview.required, false, 'stage review flags are the source of truth')
  assert.equal(run.playbook?.name, saved.name)
  assert.deepEqual(run.playbook?.stages, saved.stages, 'active snapshot survives definition edits')
  const firstReviewId = run.humanReview!.id
  await decide(run, 'request_more_data')
  for (const mode of ['aggregated', 'expanded'] as const) {
    assert.equal(reduceGraph(events(run), { mode }).nodes.find((node) => node.kind === 'human_review')?.status, 'waiting')
  }
  await assert.rejects(decide(run, 'approve'), /状态已变更/)
  await assert.rejects(request(`/runs/${run.id}/supplement`, 'POST', { reviewId: 'stale', content: '证据' }), /待补数/)
  await request(`/runs/${run.id}/supplement`, 'POST', { reviewId: firstReviewId, content: '  Mock 补数，尚未核验  ' })
  const supplement = events(run).at(-1)!
  assert.equal(supplement.type, 'human_review.requested')
  assert.equal(supplement.data.stageId, 'a')
  assert.equal(supplement.data.reviewId, firstReviewId)
  assert.equal(run.humanReview?.status, 'pending')
  assert.equal(run.humanReview?.supplement, 'Mock 补数，尚未核验')
  assert.equal(reduceGraph(events(run), { mode: 'aggregated' }).nodes.find((node) => node.kind === 'human_review')?.status, 'review')
  advance()
  assert.deepEqual(starts(run), ['z', 'a'], 'supplement does not approve or advance a gate')
  await decide(run, 'approve')
  assert.notEqual(run.status, 'completed')
  advance(100)
  assert.equal(run.status, 'running', 'next stage.started resumes status')
  assert.equal(reduceGraph(events(run), { mode: 'aggregated' }).nodes.find((node) => node.actorId === 'coordinator')?.status, 'running')
  advance()
  assert.equal(run.status, 'review')
  assert.deepEqual(starts(run), ['z', 'a', 'm'])
  assert.ok(run.participatingAgentIds.includes('coordinator'), 'empty agentIds uses mock autonomous Coordinator')
  assert.notEqual(run.humanReview?.id, firstReviewId, 'each stage has its own review identity')
  await assert.rejects(request(`/runs/${run.id}/review`, 'POST', { decision: 'approve', reviewId: firstReviewId }), /状态已变更/)
  assert.equal(run.humanReview?.status, 'pending', 'stale approval must not affect a later gate')
  for (const mode of ['aggregated', 'expanded'] as const) {
    const reviews = reduceGraph(events(run), { mode }).nodes.filter((node) => node.kind === 'human_review')
    assert.ok(reviews.some((node) => node.detail.reviewId === firstReviewId && node.status === 'completed'))
    assert.ok(!reviews.some((node) => node.detail.reviewId === firstReviewId && node.status === 'review'), 'previous gate must not stay pending')
  }
  await request(`/runs/${run.id}/review`, 'POST', { decision: 'approve', reviewId: run.humanReview!.id })
  advance()
  assert.equal(run.status, 'completed')
  assert.deepEqual(starts(run), ['z', 'a', 'm', 'tail'])
  assert.deepEqual(events(run).filter((event) => event.type === 'stage.completed').map((event) => event.data.stageId), starts(run))
  assert.equal(new Set(events(run).map((event) => event.id)).size, events(run).length)
  await assert.rejects(decide(run, 'reject'), /状态已变更/)
  applyEvent(store, { ...events(run).find((event) => event.type === 'stage.started')! })
  assert.equal(run.status, 'completed', 'late stage events cannot revive terminal runs')

  await save(playbook.id, { stages: saved.stages, status: 'enabled' })
  assert.equal(playbook.humanReview.required, true)
  const rejected = await test(playbook.id)
  advance()
  await decide(rejected, 'reject')
  advance()
  assert.equal(rejected.status, 'failed')
  assert.deepEqual(starts(rejected), ['z', 'a'])
  assert.equal(reduceGraph(events(rejected), { mode: 'aggregated' }).nodes.find((node) => node.kind === 'human_review')?.status, 'failed')

  // Rebinding from either endpoint detaches both prior partners.
  await save(playbook.id, { triggerDefinitionId: 'def_fir' })
  assert.equal(store.playbooks.find((item) => item.id === 'pb_eff')?.triggerDefinitionId, undefined)
  assertBindings()
  await save(playbook.id, { triggerDefinitionId: 'def_daily' })
  assert.equal(store.triggers.find((item) => item.id === 'def_fir')?.config.playbookId, undefined)
  assert.equal(store.playbooks.find((item) => item.id === 'pb_daily')?.triggerDefinitionId, undefined)
  assertBindings()
  await request('/triggers/def_ext', 'PATCH', { config: { playbookId: playbook.id, source: 'Mock' } })
  assert.equal(playbook.triggerDefinitionId, 'def_ext')
  assert.equal(store.triggers.find((item) => item.id === 'def_daily')?.config.playbookId, undefined)
  assertBindings()
  const bound = await request<Run>('/triggers/def_ext/test')
  assert.equal(bound.playbook?.id, playbook.id)
  advance()
  assert.deepEqual(starts(bound), ['z', 'a'])
  assert.equal(bound.trigger.triggerDefinitionId, 'def_ext')
  await decide(bound, 'reject')
  await save(playbook.id, { status: 'disabled' })
  await assert.rejects(request('/triggers/def_ext/test'), /停用/)
  await save(playbook.id, JSON.parse(JSON.stringify({ triggerDefinitionId: null })))
  assert.equal(store.triggers.find((item) => item.id === 'def_ext')?.config.playbookId, undefined)
  await request('/triggers/def_daily', 'PATCH', { config: { playbookId: 'pb_daily' } })
  await request('/triggers/def_daily', 'PATCH', { config: { playbookId: '' } })
  assert.equal(store.playbooks.find((item) => item.id === 'pb_daily')?.triggerDefinitionId, undefined)
  assertBindings()

  const foreignTrigger = await request<TriggerDefinition>('/triggers', 'POST', { ...store.triggers[0], id: 'def_foreign', projectId: 'proj_b', config: {} })
  const before = structuredClone({ playbooks: store.playbooks, triggers: store.triggers })
  await assert.rejects(save(playbook.id, { triggerDefinitionId: foreignTrigger.id }), /项目/)
  await assert.rejects(request(`/triggers/${foreignTrigger.id}`, 'PATCH', { config: { playbookId: playbook.id } }), /项目/)
  await assert.rejects(request('/triggers/def_ext', 'PATCH', { id: 'def_fir' }), /id/)
  await assert.rejects(request('/triggers/def_ext', 'PATCH', { projectId: 'proj_b' }), /项目/)
  await assert.rejects(request('/triggers/def_ext', 'PATCH', { config: { playbookId: 'missing' } }), /不存在/)
  assert.deepEqual({ playbooks: store.playbooks, triggers: store.triggers }, before)
  assertBindings()

  const legacy = store.playbooks.find((item) => item.id === 'pb_geo')!
  assert.equal(legacy.stages, undefined)
  const fallback = await test(legacy.id)
  assert.deepEqual(fallback.playbook?.stages, getPlaybookStages(legacy))
  advance()
  await decide(fallback, 'approve')
  assert.equal(fallback.status, 'completed')
  const fir = await request<Run>('/runs', 'POST', { projectId: 'proj_a', goal: 'FIR', demo: 'fir' })
  const unbound = await request<Run>('/triggers/def_ext/test')
  advance(12000)
  for (const oldRun of [fir, unbound]) {
    assert.equal(oldRun.playbook, undefined)
    assert.equal(oldRun.status, 'review')
    await decide(oldRun, 'approve')
    assert.equal(oldRun.status, 'completed')
  }
  console.log('playbook workflow ok: order, agents, gates, supplement, snapshots, validation, bindings, legacy')
} finally {
  mock.timers.reset()
}
