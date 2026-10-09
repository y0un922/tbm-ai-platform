// 用法：npm run check:sample [-- 路径]，默认校验 web/dev/sample-run.jsonl
import { readFileSync } from 'node:fs'
import type { RunEvent } from './events.ts'
import { validateRun } from './validate.ts'

const file = process.argv[2] ?? new URL('../../../web/dev/sample-run.jsonl', import.meta.url).pathname
const events = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RunEvent)
const errors = validateRun(events)
const count = (t: string) => events.filter((e) => e.type === t).length
console.log(`${file}：${events.length} 条事件，耗时 ${((events.at(-1)!.ts - events[0]!.ts) / 1000).toFixed(0)} 秒`)
console.log(`判断 ${count('finding.posted')}，修正 ${count('finding.revised')}，Agent 间消息 ${count('peer.message')}，问现场 ${count('human.asked')}，会商 ${count('session.opened')}，会签 ${count('signoff.submitted')}`)
if (errors.length) {
  console.error(`校验失败 ${errors.length} 处：\n${errors.slice(0, 30).join('\n')}`)
  process.exit(1)
}
console.log('校验通过')
