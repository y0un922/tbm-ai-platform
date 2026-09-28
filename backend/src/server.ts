import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AgentRecord, Playbook, ReviewDecision, TriggerDefinition } from '../../frontend/src/types/index.ts'
import { createRun, decideReview, patchAgent, savePlaybook, saveTrigger, subscribeRun, testPlaybook, testTrigger, submitSupplement } from './engine.ts'
import { modelInfo, specialistTools } from './pi.ts'
import { HttpError, hydrate, required, store } from './store.ts'

export const PORT = Number(process.env.PORT) || 8787

function cors(res: ServerResponse) {
  res.setHeader('access-control-allow-origin', '*')
  res.setHeader('access-control-allow-headers', 'content-type')
  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS')
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks).toString().trim()
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new HttpError(400, '无效的 JSON')
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  cors(res)
  if (typeof body === 'string') {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
    res.end(body)
    return
  }
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

function sse(res: ServerResponse, runId: string) {
  cors(res)
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  const unsub = subscribeRun(runId, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  })
  const ping = setInterval(() => res.write(': ping\n\n'), 15000)
  reqClose(res, () => {
    clearInterval(ping)
    unsub()
  })
}

function reqClose(res: ServerResponse, fn: () => void) {
  res.on('close', fn)
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`)
  let pathname = url.pathname
  if (pathname.startsWith('/api')) pathname = pathname.slice(4) || '/'
  const method = (req.method ?? 'GET').toUpperCase()
  const id = pathname.split('/').filter(Boolean)
  const projectId = url.searchParams.get('projectId') ?? undefined
  const body = method === 'GET' ? undefined : await readBody(req)

  if (method === 'GET' && pathname === '/projects') return send(res, 200, store.projects)
  if (method === 'GET' && id[0] === 'projects' && id[1]) return send(res, 200, required(store.projects.find((item) => item.id === id[1]), '项目不存在'))
  if (method === 'GET' && pathname === '/dashboard') {
    const snap = store.dashboards[projectId ?? 'proj_a']
    if (!snap) throw new HttpError(404, '项目不存在')
    return send(res, 200, snap)
  }
  if (method === 'GET' && pathname === '/agents') return send(res, 200, store.agents.map((item) => ({ ...item, runtimeTools: specialistTools(item.id) })))
  if (method === 'GET' && id[0] === 'agents' && id[1]) return send(res, 200, required(store.agents.find((item) => item.id === id[1]), 'Agent 不存在'))
  if (method === 'PATCH' && id[0] === 'agents' && id[1]) return send(res, 200, patchAgent(id[1], body as Partial<AgentRecord>))
  if (method === 'GET' && pathname === '/triggers') return send(res, 200, store.triggers.filter((item) => !projectId || item.projectId === projectId))
  if (method === 'POST' && pathname === '/triggers') {
    const row = body as TriggerDefinition
    if (row?.id && store.triggers.some((item) => item.id === row.id)) throw new HttpError(400, 'Trigger id 已存在')
    return send(res, 200, saveTrigger({ ...row, id: row?.id || `def_${crypto.randomUUID()}` }))
  }
  if (method === 'PATCH' && id[0] === 'triggers' && id[1] && id[2] !== 'test') {
    const current = required(store.triggers.find((item) => item.id === id[1]), 'Trigger 不存在')
    return send(res, 200, saveTrigger({ ...current, ...(body as Partial<TriggerDefinition>) }, id[1]))
  }
  if (method === 'POST' && id[0] === 'triggers' && id[2] === 'test') return send(res, 200, hydrate(testTrigger(id[1])))
  if (method === 'GET' && pathname === '/trigger-instances') {
    return send(res, 200, store.instances.filter((item) => {
      if (!projectId) return true
      const def = item.triggerDefinitionId ? store.triggers.find((row) => row.id === item.triggerDefinitionId) : undefined
      const run = store.runs.find((row) => row.trigger.id === item.id)
      return def?.projectId === projectId || run?.projectId === projectId
    }))
  }
  if (method === 'GET' && pathname === '/playbooks') return send(res, 200, store.playbooks.filter((item) => !projectId || item.projectId === projectId))
  if (method === 'POST' && pathname === '/playbooks') return send(res, 200, savePlaybook(body as Partial<Playbook>))
  if (method === 'POST' && id[0] === 'playbooks' && id[1] && id[2] === 'test') return send(res, 200, hydrate(testPlaybook(id[1])))
  if (method === 'PATCH' && id[0] === 'playbooks' && id[1] && !id[2]) {
    required(store.playbooks.find((item) => item.id === id[1]), 'Playbook 不存在')
    return send(res, 200, savePlaybook(body as Partial<Playbook>, id[1]))
  }
  if (method === 'GET' && pathname === '/capabilities') return send(res, 200, store.capabilities)
  if (method === 'GET' && pathname === '/runs') return send(res, 200, store.runs.filter((item) => !projectId || item.projectId === projectId).map((item) => hydrate(item)))
  if (method === 'GET' && id[0] === 'runs' && id[1] && !id[2]) return send(res, 200, hydrate(required(store.runs.find((item) => item.id === id[1]), '运行不存在')))
  if (method === 'GET' && id[0] === 'runs' && id[2] === 'events') {
    required(store.runs.find((item) => item.id === id[1]), '运行不存在')
    sse(res, id[1])
    return
  }
  if (method === 'POST' && pathname === '/runs') return send(res, 200, hydrate(createRun(body as { projectId: string; goal: string; demo?: 'fir' })))
  if (method === 'POST' && id[0] === 'runs' && id[2] === 'review') {
    const row = body as { decision: ReviewDecision; reviewId?: string }
    return send(res, 200, hydrate(decideReview(id[1], row?.decision, row?.reviewId)))
  }
  if (method === 'POST' && id[0] === 'runs' && id[2] === 'supplement') {
    const row = body as { reviewId: string; content: string }
    return send(res, 200, hydrate(submitSupplement(id[1], row?.reviewId, row?.content)))
  }
  if (method === 'GET' && pathname === '/settings') return send(res, 200, store.settings)
  if (method === 'PATCH' && pathname === '/settings') {
    Object.assign(store.settings, body)
    return send(res, 200, store.settings)
  }
  if (method === 'GET' && pathname === '/health') {
    try {
      return send(res, 200, { ok: true, model: await modelInfo() })
    } catch (error) {
      return send(res, 200, { ok: true, model: null, error: error instanceof Error ? error.message : String(error) })
    }
  }
  throw new HttpError(404, `没有对应的接口 ${method} ${pathname}`)
}

export const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    const status = error instanceof HttpError ? error.status : 500
    send(res, status, error instanceof Error ? error.message : '服务器错误')
  })
})

server.listen(PORT, () => {
  console.log(`TBM backend http://127.0.0.1:${PORT}/api`)
})
