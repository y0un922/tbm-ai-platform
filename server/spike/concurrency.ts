// 验证 1：5 个 Agent 并发调用 DeepSeek，各自调用工具，统计延迟和工具调用成功率
import { Agent, type AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from 'typebox'
import { ringRange } from '../src/data/scenario.ts'
import { MODEL_ID, setupModel } from '../src/model.ts'

const { model, streamFn } = setupModel()
const ROUNDS = Number(process.argv[2] ?? 2)

const queryParams = Type.Object({ ringFrom: Type.Number(), ringTo: Type.Number() })
const queryTool: AgentTool<typeof queryParams> = {
  name: 'query_rings',
  label: '查询环数据',
  description: '按环号区间查询掘进数据，返回每环的推进速度、扭矩、泡沫注入率等',
  parameters: queryParams,
  execute: async (_id, { ringFrom, ringTo }) => {
    const rows = ringRange(ringFrom, ringTo).map((r) => ({ ring: r.ring, v: r.advanceSpeed, torque: r.torque, fir: r.fir }))
    return { content: [{ type: 'text', text: JSON.stringify(rows) }], details: { count: rows.length } }
  },
}

async function runOne(name: string, from: number, to: number) {
  const t0 = performance.now()
  let firstToken = 0
  let toolCalls = 0
  let toolErrors = 0
  let input = 0
  let output = 0
  const agent = new Agent({
    initialState: {
      systemPrompt: '你是盾构掘进数据分析员。必须先调用工具查询数据，再用两句中文给出结论。',
      model,
      thinkingLevel: 'low',
      tools: [queryTool],
    },
    streamFn,
  })
  agent.subscribe((e) => {
    if (e.type === 'message_update' && !firstToken) firstToken = performance.now() - t0
    if (e.type === 'tool_execution_end') {
      toolCalls++
      if (e.isError) toolErrors++
    }
    if (e.type === 'turn_end' && e.message.role === 'assistant') {
      input += e.message.usage.input
      output += e.message.usage.output
    }
  })
  await agent.prompt(`查询 ${from} 到 ${to} 环的数据，说明推进速度的变化。`)
  const last = agent.state.messages.at(-1)
  const text = last?.role === 'assistant' ? last.content.filter((c) => c.type === 'text').map((c) => c.text).join('') : ''
  return {
    name,
    ms: Math.round(performance.now() - t0),
    firstTokenMs: Math.round(firstToken),
    toolCalls,
    toolErrors,
    input,
    output,
    error: agent.state.errorMessage,
    text: text.slice(0, 80).replace(/\n/g, ' '),
  }
}

console.log(`模型 deepseek/${MODEL_ID}，${ROUNDS} 轮，每轮 5 路并发`)
for (let round = 1; round <= ROUNDS; round++) {
  const t0 = performance.now()
  const results = await Promise.all([
    runOne('协调', 500, 540),
    runOne('地质', 515, 530),
    runOne('掘进', 510, 530),
    runOne('刀盘', 520, 540),
    runOne('渣土', 500, 525),
  ])
  console.log(`\n第 ${round} 轮，总耗时 ${Math.round(performance.now() - t0)} ms`)
  console.table(results)
}
