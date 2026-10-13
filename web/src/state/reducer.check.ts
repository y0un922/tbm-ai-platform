// 用法：npm run check:reducer -w @tbm/web [-- 路径]，默认用 web/dev/sample-run.jsonl
// 联调时可以直接指向后端的 server/runs/<runId>.jsonl
import { readFileSync } from 'node:fs'
import { validateRun, type RunEvent } from '@tbm/shared'
import { initialState, reduce } from './reducer.ts'

const file = process.argv[2] ?? new URL('../../dev/sample-run.jsonl', import.meta.url).pathname
const events = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RunEvent)
const errors: string[] = validateRun(events).map((e) => `事件流：${e}`)
const check = (ok: boolean, msg: string) => ok || errors.push(msg)
const count = (t: string) => events.filter((e) => e.type === t).length

const s = events.reduce(reduce, initialState)

// 断线重连会补发重叠的事件：重复喂一遍，结果必须一模一样
const replayed = [...events, ...events.slice(events.length / 2)].reduce(reduce, initialState)
check(JSON.stringify(replayed) === JSON.stringify(s), '重复事件改变了状态（seq 去重失效）')

check(s.lastSeq === events.at(-1)!.seq, `lastSeq ${s.lastSeq} ≠ 最后一条 seq`)
check(s.status !== 'running', '收到 run.finished 后状态仍为 running')
check(s.findingOrder.length === count('finding.posted'), '判断数量不符')
check(s.messages.length === count('peer.message'), '消息数量不符')
check(Object.values(s.findings).reduce((n, f) => n + f.revisions.length, 0) === count('finding.revised'), '修正记录数量不符')
check(s.questionOrder.every((id) => s.questions[id].answer), '有现场提问没有收到回答或超时')
const lastStats = events.findLast((e) => e.type === 'collab.stats')
check(!lastStats || JSON.stringify(s.stats) === JSON.stringify(lastStats.data), '协作计数与最后一条 collab.stats 不符')
for (const t of events.filter((e) => e.type === 'tool.started')) {
  const done = s.agents[t.data.agentId].tools.find((x) => x.callId === t.data.callId)
  check(!!done?.result, `工具调用 ${t.data.callId} 没有结果`)
}

const edges = Object.values(s.edges).sort((x, y) => y.count - x.count)
console.log(`${file}：${events.length} 条事件，状态 ${s.status}，阶段 ${s.stage}`)
console.log(`连线 ${edges.length} 条：${edges.map((e) => `${e.key}×${e.count}${e.challenges ? `(⚡${e.challenges})` : ''}`).join(' ')}`)
console.log(`判断：${s.findingOrder.map((id) => `${id}v${s.findings[id].version}·${s.findings[id].reactions.length}反应`).join(' ')}`)
console.log(`计数：${JSON.stringify(s.stats)}`)
if (errors.length) {
  console.error(`检查失败 ${errors.length} 处：\n${errors.slice(0, 30).join('\n')}`)
  process.exit(1)
}
console.log('reducer 检查通过')
