import { Type } from '@earendil-works/pi-ai'
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent'
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentRecord, RuntimeEvent } from '../../frontend/src/types/index.ts'
import { emptyEvidence, PARTITION, store, type EvidenceItem } from './store.ts'
import { firDropPct, ring, rings } from './rings.ts'

type Emit = (type: RuntimeEvent['type'], data: Record<string, unknown>, extra?: { sourceId?: string; targetId?: string }) => void

const TOOL_META: Record<string, { name: string; kind: 'tool' | 'api' | 'data_source'; event: 'tool.called' | 'api.called' }> = {
  query_ring_metrics: { name: '传感器数据', kind: 'data_source', event: 'tool.called' },
  query_foam: { name: 'Foam API', kind: 'api', event: 'api.called' },
  query_lab_muck: { name: '渣土实验室 API', kind: 'api', event: 'api.called' },
  query_geology: { name: '地质数据库', kind: 'data_source', event: 'tool.called' },
  write_evidence: { name: '写入证据分区', kind: 'tool', event: 'tool.called' },
  write_conclusion: { name: '写入综合结论', kind: 'tool', event: 'tool.called' },
  request_review: { name: '请求人工审核', kind: 'tool', event: 'tool.called' },
  delegate: { name: '委派专业 Agent', kind: 'tool', event: 'tool.called' },
}

let modelBoot: Promise<{ modelRuntime: ModelRuntime; model: NonNullable<Awaited<ReturnType<ModelRuntime['getAvailable']>>[number]>; cwd: string }> | undefined

function preferredModelId() {
  try {
    return String(JSON.parse(readFileSync(join(getAgentDir(), 'settings.json'), 'utf8')).defaultModel ?? '')
  } catch {
    return ''
  }
}

async function boot() {
  if (!modelBoot) {
    modelBoot = (async () => {
      const modelRuntime = await ModelRuntime.create()
      const available = await modelRuntime.getAvailable()
      if (!available.length) throw new Error('未配置可用模型。请在本机运行 pi 并完成 /login')
      const raw = preferredModelId()
      const slash = raw.indexOf('/')
      const provider = slash >= 0 ? raw.slice(0, slash) : ''
      const id = slash >= 0 ? raw.slice(slash + 1) : raw
      const model = (provider ? modelRuntime.getModel(provider, id) : undefined)
        ?? available.find((item) => `${item.provider}/${item.id}` === raw || item.id === id)
        ?? available[0]!
      const cwd = await mkdtemp(join(tmpdir(), 'tbm-pi-'))
      return { modelRuntime, model, cwd }
    })()
  }
  return modelBoot
}

export async function modelInfo() {
  const { model } = await boot()
  return { provider: model.provider, id: model.id }
}

function textOf(result: unknown) {
  if (result && typeof result === 'object') {
    const row = result as { content?: Array<{ type?: string; text?: string }>; details?: unknown }
    if (row.details != null) return row.details
    const text = row.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n')
    if (text) return text
  }
  return result
}

function evidenceOf(runId: string) {
  return store.evidence[runId] ?? (store.evidence[runId] = emptyEvidence())
}

function pushEvidence(runId: string, item: EvidenceItem) {
  const partition = PARTITION[item.agentId]
  if (!partition) throw new Error(`Agent ${item.agentId} 不能写入证据分区`)
  if (item.partition !== partition) throw new Error(`禁止写入 ${item.partition}，${item.agentId} 只能写 ${partition}`)
  evidenceOf(runId)[partition].push(item)
}

export function specialistTools(agentId: string): string[] {
  if (agentId === 'c1') return ['query_geology', 'query_ring_metrics', 'write_evidence']
  if (agentId === 'c2') return ['query_ring_metrics', 'write_evidence']
  if (agentId === 'c6') return ['query_foam', 'query_lab_muck', 'query_ring_metrics', 'write_evidence']
  if (agentId === 'c3') return ['query_ring_metrics', 'write_evidence']
  if (agentId === 'c4') return ['query_ring_metrics', 'write_evidence']
  if (agentId === 'coordinator') return ['write_conclusion', 'request_review']
  return []
}

function toolsFor(agentId: string, runId: string): ToolDefinition[] {
  const ok = new Set(specialistTools(agentId))
  const all: ToolDefinition[] = [
    defineTool({
      name: 'query_ring_metrics',
      label: '环参数',
      description: '查询指定环或环区间的 FIR、贯入度、推力、扭矩、螺旋机电流、推进速度。默认 1246–1250。',
      parameters: Type.Object({
        ring: Type.Optional(Type.Number({ description: '单环号' })),
        from: Type.Optional(Type.Number({ description: '起始环' })),
        to: Type.Optional(Type.Number({ description: '结束环' })),
      }),
      async execute(_id, params) {
        const rows = params.ring != null ? rings(params.ring, params.ring, runId) : rings(params.from ?? 1246, params.to ?? 1250, runId)
        const details = { rows, firDropPct: firDropPct(rows[0]?.ring ?? 1246, rows.at(-1)?.ring ?? 1250, runId), unit: { fir: 'm/h', penetration: 'mm/r' } }
        return { content: [{ type: 'text', text: JSON.stringify(details) }], details }
      },
    }),
    defineTool({
      name: 'query_foam',
      label: '泡沫',
      description: '查询泡沫压力与波动。',
      parameters: Type.Object({ ring: Type.Optional(Type.Number()) }),
      async execute(_id, params) {
        const rows = rings(params.ring ?? 1250, params.ring ?? 1250, runId).map((row) => ({ ring: row.ring, foamBar: row.foamBar, fluctuation: row.foamFluctuation }))
        return { content: [{ type: 'text', text: JSON.stringify(rows) }], details: rows }
      },
    }),
    defineTool({
      name: 'query_lab_muck',
      label: '渣土',
      description: '查询渣土流动性与含水率。',
      parameters: Type.Object({ ring: Type.Optional(Type.Number()) }),
      async execute(_id, params) {
        const rows = rings(params.ring ?? 1248, params.ring ?? 1250, runId).map((row) => ({ ring: row.ring, muckFlow: row.muckFlow, moisture: row.muckMoisture }))
        return { content: [{ type: 'text', text: JSON.stringify(rows) }], details: rows }
      },
    }),
    defineTool({
      name: 'query_geology',
      label: '地质',
      description: '查询环附近地层描述。',
      parameters: Type.Object({ ring: Type.Optional(Type.Number()) }),
      async execute(_id, params) {
        const n = params.ring ?? 1250
        const details = { ring: n, description: ring(n, runId)?.geology ?? '无资料', window: rings(Math.max(1246, n - 4), n, runId).map((row) => ({ ring: row.ring, geology: row.geology })) }
        return { content: [{ type: 'text', text: JSON.stringify(details) }], details }
      },
    }),
    defineTool({
      name: 'write_evidence',
      label: '写证据',
      description: '把本专业判断写入自己的证据分区。必须调用一次。',
      parameters: Type.Object({
        summary: Type.String({ description: '面向业务的结论摘要' }),
        ring: Type.Optional(Type.Number()),
        data: Type.Optional(Type.String({ description: '可选 JSON 字符串' })),
      }),
      executionMode: 'sequential',
      async execute(_id, params) {
        const partition = PARTITION[agentId]
        if (!partition) throw new Error('Coordinator 不能写专业证据')
        const item: EvidenceItem = {
          agentId,
          partition,
          summary: params.summary,
          ring: params.ring,
          timestamp: new Date().toISOString(),
          data: params.data ? JSON.parse(params.data) : undefined,
        }
        pushEvidence(runId, item)
        return { content: [{ type: 'text', text: `已写入 evidence.${partition}` }], details: item }
      },
    }),
    defineTool({
      name: 'write_conclusion',
      label: '写结论',
      description: 'Coordinator 根据全量证据写入综合结论。可保留多个候选原因。',
      parameters: Type.Object({
        text: Type.String(),
        reason: Type.Optional(Type.String()),
        risk: Type.Optional(Type.String()),
        missing: Type.Optional(Type.Array(Type.String())),
        recommendation: Type.Optional(Type.String()),
      }),
      executionMode: 'sequential',
      async execute(_id, params) {
        if (agentId !== 'coordinator') throw new Error('只有 Coordinator 可写结论区')
        evidenceOf(runId).conclusion = {
          text: params.text,
          reason: params.reason,
          risk: params.risk,
          missing: params.missing,
          recommendation: params.recommendation,
        }
        return { content: [{ type: 'text', text: '结论已写入' }], details: evidenceOf(runId).conclusion }
      },
    }),
    defineTool({
      name: 'request_review',
      label: '送审',
      description: '本阶段需要人工审核时调用。填写原因、结论、风险、缺失项和建议。系统不会向 PLC 下发。',
      parameters: Type.Object({
        reason: Type.String(),
        result: Type.String(),
        risk: Type.String(),
        missing: Type.Array(Type.String()),
        recommendation: Type.String(),
      }),
      executionMode: 'sequential',
      async execute(_id, params) {
        if (agentId !== 'coordinator') throw new Error('只有 Coordinator 可送审')
        evidenceOf(runId).conclusion = {
          text: params.result,
          reason: params.reason,
          risk: params.risk,
          missing: params.missing,
          recommendation: params.recommendation,
        }
        return { content: [{ type: 'text', text: '已记录送审材料' }], details: params }
      },
    }),
  ]
  return all.filter((tool) => ok.has(tool.name))
}

export async function runPiAgent(input: {
  agent: AgentRecord
  runId: string
  stageId: string
  prompt: string
  emit: Emit
  extraTools?: ToolDefinition[]
}) {
  const started = Date.now()
  const { modelRuntime, model, cwd } = await boot()
  const customTools = [...toolsFor(input.agent.id, input.runId), ...(input.extraTools ?? [])]
  const names = customTools.map((tool) => tool.name)
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPromptOverride: () => [
      input.agent.instructions,
      '你在盾构机多智能体系统中运行，通过 Tool 取数和写证据。',
      '禁止提出或生成 PLC / 设备写指令。',
      `当前身份：${input.agent.name} (${input.agent.id})。`,
      `可用工具：${names.join(', ')}。该用的工具必须调用。`,
      '用中文简短回答。',
    ].join('\n'),
    appendSystemPromptOverride: () => [],
  })
  await loader.reload()
  const { session } = await createAgentSession({
    cwd,
    agentDir: getAgentDir(),
    model,
    modelRuntime,
    thinkingLevel: 'low',
    noTools: 'builtin',
    customTools,
    tools: names,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(cwd),
    settingsManager: SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: true, maxRetries: 2 } }),
  })
  const pending = new Map<string, { at: number; args: unknown }>()
  try {
    session.subscribe((event) => {
      if (event.type === 'tool_execution_start') pending.set(event.toolCallId, { at: Date.now(), args: event.args })
      if (event.type === 'tool_execution_end') {
        const meta = TOOL_META[event.toolName] ?? { name: event.toolName, kind: 'tool' as const, event: 'tool.called' as const }
        const start = pending.get(event.toolCallId)
        input.emit(meta.event, {
          agentId: input.agent.id,
          stageId: input.stageId,
          name: meta.name,
          kind: meta.kind,
          toolId: event.toolName,
          status: event.isError ? 'failed' : 'completed',
          durationMs: Date.now() - (start?.at ?? started),
          input: start?.args,
          output: textOf(event.result),
        }, { sourceId: input.agent.id, targetId: event.toolName })
      }
      if (event.type === 'message_end' && 'message' in event) {
        const message = event.message as { role?: string; content?: Array<{ type?: string; text?: string; thinking?: string }> }
        if (message.role !== 'assistant') return
        const thinking = message.content?.filter((item) => item.type === 'thinking' || item.type === 'reasoning').map((item) => item.text || item.thinking || '').join('').trim()
        if (thinking) input.emit('agent.thinking', { agentId: input.agent.id, stageId: input.stageId, text: thinking }, { sourceId: input.agent.id })
        const text = message.content?.filter((item) => item.type === 'text').map((item) => item.text).join('').trim()
        if (text) input.emit('agent.message', { agentId: input.agent.id, stageId: input.stageId, to: input.agent.id === 'coordinator' ? undefined : 'coordinator', text }, { sourceId: input.agent.id, targetId: input.agent.id === 'coordinator' ? undefined : 'coordinator' })
      }
    })
    await session.prompt(input.prompt)
    return session.getLastAssistantText() ?? ''
  } finally {
    session.dispose()
  }
}
