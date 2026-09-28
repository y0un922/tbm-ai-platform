import type { AgentRecord, Playbook, ReviewDecision, TriggerDefinition } from '@/types'
import { decideReview, createRun, saveTrigger, testTrigger, submitSupplement, savePlaybook, testPlaybook } from '@/mocks/engine'
import { store } from '@/mocks/store'

export class MockError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function hydrate<T extends { startedAt: string; endedAt?: string; durationMs?: number }>(run: T): T {
  const end = run.endedAt ? new Date(run.endedAt).getTime() : Date.now()
  return { ...run, durationMs: end - new Date(run.startedAt).getTime() }
}

export async function mockRequest<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const url = new URL(path, 'http://mock.local')
  const method = (init?.method ?? 'GET').toUpperCase()
  const id = url.pathname.split('/').filter(Boolean)
  const projectId = url.searchParams.get('projectId') ?? undefined

  if (method === 'GET' && url.pathname === '/projects') return store.projects as T
  if (method === 'GET' && id[0] === 'projects' && id[1]) return required(store.projects.find((p) => p.id === id[1]), '项目不存在') as T
  if (method === 'GET' && url.pathname === '/dashboard') {
    const snap = store.dashboards[projectId ?? 'proj_a']
    if (!snap) throw new MockError(404, '项目不存在')
    return snap as T
  }
  if (method === 'GET' && url.pathname === '/agents') return store.agents as T
  if (method === 'GET' && id[0] === 'agents' && id[1]) return required(store.agents.find((a) => a.id === id[1]), 'Agent 不存在') as T
  if (method === 'PATCH' && id[0] === 'agents' && id[1]) {
    const agent = required(store.agents.find((a) => a.id === id[1]), 'Agent 不存在')
    Object.assign(agent, init?.body as Partial<AgentRecord>, { updatedAt: new Date().toISOString() })
    return agent as T
  }
  if (method === 'GET' && url.pathname === '/triggers') return store.triggers.filter((t) => !projectId || t.projectId === projectId) as T
  if (method === 'POST' && url.pathname === '/triggers') {
    const body = init?.body as TriggerDefinition
    if (body?.id && store.triggers.some((trigger) => trigger.id === body.id)) throw new MockError(400, 'Trigger id 已存在')
    return saveTrigger({ ...body, id: body?.id || `def_${crypto.randomUUID()}` }) as T
  }
  if (method === 'PATCH' && id[0] === 'triggers' && id[1] && id[2] !== 'test') {
    const current = required(store.triggers.find((t) => t.id === id[1]), 'Trigger 不存在')
    return saveTrigger({ ...current, ...(init?.body as Partial<TriggerDefinition>) }, id[1]) as T
  }
  if (method === 'POST' && id[0] === 'triggers' && id[2] === 'test') return testTrigger(id[1]) as T
  if (method === 'GET' && url.pathname === '/trigger-instances') {
    return store.instances.filter((t) => {
      if (!projectId) return true
      const def = t.triggerDefinitionId ? store.triggers.find((d) => d.id === t.triggerDefinitionId) : undefined
      const run = store.runs.find((r) => r.trigger.id === t.id)
      return def?.projectId === projectId || run?.projectId === projectId
    }) as T
  }
  if (method === 'GET' && url.pathname === '/playbooks') return store.playbooks.filter((p) => !projectId || p.projectId === projectId) as T
  if (method === 'POST' && url.pathname === '/playbooks') return savePlaybook(init?.body as Partial<Playbook>) as T
  if (method === 'POST' && id[0] === 'playbooks' && id[1] && id[2] === 'test') return testPlaybook(id[1]) as T
  if (method === 'PATCH' && id[0] === 'playbooks' && id[1] && !id[2]) {
    required(store.playbooks.find((p) => p.id === id[1]), 'Playbook 不存在')
    return savePlaybook(init?.body as Partial<Playbook>, id[1]) as T
  }
  if (method === 'GET' && url.pathname === '/capabilities') return store.capabilities as T
  if (method === 'GET' && url.pathname === '/runs') return store.runs.filter((r) => !projectId || r.projectId === projectId).map((r) => hydrate(r)) as T
  if (method === 'GET' && id[0] === 'runs' && id[1] && !id[2]) return hydrate(required(store.runs.find((r) => r.id === id[1]), '运行不存在')) as T
  if (method === 'GET' && id[0] === 'runs' && id[2] === 'events') return store.events.filter((e) => e.runId === id[1]) as T
  if (method === 'POST' && url.pathname === '/runs') return createRun(init?.body as { projectId: string; goal: string; demo?: 'fir' }) as T
  if (method === 'POST' && id[0] === 'runs' && id[2] === 'review') {
    const body = init?.body as { decision: ReviewDecision; reviewId?: string }
    return hydrate(decideReview(id[1], body?.decision, body?.reviewId)) as T
  }
  if (method === 'POST' && id[0] === 'runs' && id[2] === 'supplement') {
    const body = init?.body as { reviewId: string; content: string }
    return hydrate(submitSupplement(id[1], body?.reviewId, body?.content)) as T
  }
  if (method === 'GET' && url.pathname === '/settings') return store.settings as T
  if (method === 'PATCH' && url.pathname === '/settings') {
    Object.assign(store.settings, init?.body)
    return store.settings as T
  }
  throw new MockError(404, `没有对应的接口 ${method} ${url.pathname}`)
}

function required<T>(value: T | undefined, message: string): T {
  if (!value) throw new MockError(404, message)
  return value
}
