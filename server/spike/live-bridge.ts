// 临时联调桥：正式后端完成前，把 spike/debate.ts 的真实会商按 @tbm/shared api.ts 契约暴露给前端。
// 用法：npm run spike:bridge -w @tbm/server，再 npm run dev:http -w @tbm/web
// 只实现前端用到的接口。现场回答和负责人审核按行写入 debate.ts 的 stdin，由它真正等待。正式后端上线后删除本文件
import { API_PORT, MAX_QUESTION_LEN, SSE_PING_MS, type AnswerRequest, type CreateRunRequest, type ReviewRequest, type RingPoint, type RunEvent } from '@tbm/shared'
import { spawn, type ChildProcess } from 'node:child_process'
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { RINGS } from '../src/data/scenario.ts'
import { MODEL_ID } from '../src/model.ts'

interface Run {
  runId: string
  file: string
  child: ChildProcess
  events: RunEvent[]
  subs: Set<(e: RunEvent) => void>
  finished: boolean
}
let current: Run | undefined

function push(run: Run, e: RunEvent) {
  run.events.push(e)
  if (e.type === 'run.finished') run.finished = true
  for (const f of run.subs) f(e)
}

/** debate.ts 退出前没发 run.finished（崩溃或被中止）时补一条 */
function finish(run: Run, status: 'failed' | 'aborted', error?: string) {
  if (run.finished) return
  push(run, { seq: (run.events.at(-1)?.seq ?? 0) + 1, ts: Date.now(), runId: run.runId, type: 'run.finished', data: { status, error } })
}

/** 跟踪 debate.ts 追加写入的事件文件 */
function tail(run: Run) {
  let offset = 0
  let rest = ''
  let exited = false
  const decoder = new StringDecoder('utf8')
  run.child.on('exit', (code) => { exited = true; if (code) console.error(`[bridge] debate.ts 退出码 ${code}`) })
  const timer = setInterval(() => {
    if (existsSync(run.file)) {
      const fd = openSync(run.file, 'r')
      const size = fstatSync(fd).size
      if (size > offset) {
        const buf = Buffer.alloc(size - offset)
        readSync(fd, buf, 0, buf.length, offset)
        offset = size
        const lines = (rest + decoder.write(buf)).split('\n')
        rest = lines.pop()!
        for (const l of lines) if (l) push(run, { ...(JSON.parse(l) as RunEvent), runId: run.runId })
      }
      closeSync(fd)
    }
    if (exited || run.finished) {
      clearInterval(timer)
      finish(run, 'failed', 'debate.ts 异常退出，详见桥接服务日志')
    }
  }, 100)
}

function startRun(req: CreateRunRequest): Run {
  const runId = `live-${Date.now()}`
  const file = join(tmpdir(), `tbm-${runId}.jsonl`)
  const extra = [...(req.question?.trim() ? ['--question', req.question.trim()] : []), ...(req.trigger ? ['--trigger', JSON.stringify(req.trigger)] : [])]
  const child = spawn(process.execPath, ['--import', 'tsx', 'spike/debate.ts', '--live', file, ...extra], {
    cwd: new URL('..', import.meta.url).pathname,
    stdio: ['pipe', 'inherit', 'inherit'], // stdin 用来转交现场回答和审核决定
  })
  child.stdin?.on('error', () => {}) // 子进程已退出时写入会触发 EPIPE，忽略即可，接口照常返回
  const run: Run = { runId, file, child, events: [], subs: new Set(), finished: false }
  tail(run)
  console.log(`[bridge] 开始会商 ${runId}，事件写入 ${file}`)
  return run
}

function stageOf(run: Run) {
  const e = run.events.findLast((x) => x.type === 'stage.changed')
  return e?.type === 'stage.changed' ? e.data.stage : 'snapshot'
}

// ---------- HTTP ----------

const json = (res: ServerResponse, status: number, body?: unknown) => {
  res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json; charset=utf-8' })
  res.end(body === undefined ? undefined : JSON.stringify(body))
}

async function readBody<T>(req: IncomingMessage): Promise<T> {
  let s = ''
  for await (const chunk of req) s += chunk
  return (s ? JSON.parse(s) : {}) as T
}

function sse(req: IncomingMessage, res: ServerResponse, run: Run, after: number) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' })
  let open = true
  const send = (e: RunEvent) => {
    if (!open) return
    res.write(`id: ${e.seq}\ndata: ${JSON.stringify(e)}\n\n`)
    if (e.type === 'run.finished') close()
  }
  const ping = setInterval(() => res.write(': ping\n\n'), SSE_PING_MS)
  const close = () => {
    if (!open) return
    open = false
    clearInterval(ping)
    run.subs.delete(send)
    res.end()
  }
  req.on('close', close)
  for (const e of run.events) if (e.seq > after) send(e)
  if (open) run.subs.add(send)
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const parts = url.pathname.split('/').filter(Boolean) // ['api', 'runs', id, ...]
  const run = parts[1] === 'runs' && parts[2] && current?.runId === parts[2] ? current : undefined
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, model: `deepseek/${MODEL_ID}` })

    if (req.method === 'GET' && url.pathname === '/api/data/rings') {
      const from = Number(url.searchParams.get('from') ?? 0), to = Number(url.searchParams.get('to') ?? Infinity)
      const rings: RingPoint[] = RINGS.filter((r) => r.ring >= from && r.ring <= to)
        .map((r) => ({ ring: r.ring, advanceSpeed: r.advanceSpeed, torque: r.torque, thrust: r.thrust, fir: r.fir, gravelContent: r.gravelContent }))
      return json(res, 200, rings)
    }

    if (req.method === 'POST' && url.pathname === '/api/runs') {
      const body = await readBody<CreateRunRequest>(req)
      if (body.mode === 'replay') return json(res, 400, { error: '临时桥接只支持真实运行（live）；回放请用 npm run dev -w @tbm/web' })
      if (body.question && body.question.length > MAX_QUESTION_LEN) return json(res, 400, { error: `question 超过 ${MAX_QUESTION_LEN} 字` })
      if (current && !current.finished) return json(res, 409, { error: '已有会商在运行' })
      current = startRun(body)
      return json(res, 201, { runId: current.runId })
    }

    if (parts[1] === 'runs' && parts[2]) {
      if (!run) return json(res, 404, { error: '运行不存在（桥接重启后历史运行不保留）' })
      const action = parts[3]
      if (req.method === 'GET' && !action) {
        const stage = stageOf(run)
        const end = run.events.findLast((e) => e.type === 'run.finished')
        const status = end?.type === 'run.finished' ? end.data.status : stage === 'approval' ? 'awaiting_review' : 'running'
        return json(res, 200, { runId: run.runId, mode: 'live', status, stage, lastSeq: run.events.at(-1)?.seq ?? 0, startedAt: run.events[0]?.ts ?? Date.now() })
      }
      if (req.method === 'GET' && action === 'events') {
        const after = Number(url.searchParams.get('after') ?? req.headers['last-event-id'] ?? 0)
        return sse(req, res, run, after)
      }
      if (req.method === 'GET' && action === 'evidence' && parts[4]) {
        const f = `${run.file}.evidence.json`
        const ev = existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>)[parts[4]] : undefined
        return ev ? json(res, 200, ev) : json(res, 404, { error: `证据 ${parts[4]} 不存在` })
      }
      if (req.method === 'POST' && action === 'answer') {
        const body = await readBody<AnswerRequest>(req)
        if (!run.events.some((e) => e.type === 'human.asked' && e.data.questionId === body.questionId)) return json(res, 404, { error: `问题 ${body.questionId} 不存在` })
        if (run.events.some((e) => e.type === 'human.answered' && e.data.questionId === body.questionId)) return json(res, 409, { error: '问题已回答或已超时' })
        if (!body.text?.trim()) return json(res, 400, { error: '回答不能为空' })
        if (run.finished) return json(res, 409, { error: '运行已结束' })
        run.child.stdin?.write(JSON.stringify({ type: 'answer', questionId: body.questionId, text: body.text }) + '\n')
        return json(res, 204)
      }
      if (req.method === 'POST' && action === 'review') {
        const body = await readBody<ReviewRequest>(req)
        if (body.decision !== 'approve' && body.decision !== 'reject') return json(res, 400, { error: 'decision 只支持 approve / reject' })
        const latest = run.events.findLast((e) => e.type === 'conclusion.drafted')
        if (stageOf(run) !== 'approval' || run.events.some((e) => e.type === 'review.decided')) return json(res, 409, { error: '当前不在人工审核阶段' })
        if (latest?.type !== 'conclusion.drafted' || latest.data.version !== body.version) return json(res, 409, { error: '只能审核最新版本的结论' })
        run.child.stdin?.write(JSON.stringify({ type: 'review', version: body.version, decision: body.decision, comment: body.comment }) + '\n')
        return json(res, 204)
      }
      if (req.method === 'POST' && action === 'abort') {
        if (run.finished) return json(res, 409, { error: '运行已结束' })
        run.child.kill()
        finish(run, 'aborted')
        return json(res, 204)
      }
    }
    json(res, 404, { error: `未实现：${req.method} ${url.pathname}` })
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) })
  }
}).listen(API_PORT, '127.0.0.1', () => console.log(`[bridge] 监听 http://127.0.0.1:${API_PORT}（模型 deepseek/${MODEL_ID}）`))
