// Agent 配置：每个 Agent 的模型、system prompt、可用工具 / MCP / Skill、协作配额。
// 后端还没有配置接口，保存只写入浏览器本地草稿，不影响实际运行
import { AGENTS, STAGES, type Stage } from '@tbm/shared'
import { Activity, Bot, Database, Lock, RotateCcw, Save, Search, Wrench } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Badge, Btn, Card, inputCls, Kpi, PageHead, selectCls, Tabs } from '../components/kit.tsx'
import { AGENT_ICON, STATUS } from '../components/labels.ts'
import { CAPABILITIES, DEFAULT_CONFIGS, KIND_LABEL, MODELS, STATUS_LABEL, type AgentConfig, type CapKind, type ThinkingLevel } from '../data/catalog.ts'
import type { ViewState } from '../state/reducer.ts'

type Id = AgentConfig['id']
const IDS: Id[] = ['coordinator', 'geology', 'boring', 'cutter', 'muck']
const DRAFT_KEY = 'tbm.agentConfig.draft'
const THINKING: { id: ThinkingLevel; label: string }[] = [{ id: 'off', label: '关闭' }, { id: 'low', label: '低' }, { id: 'medium', label: '中' }, { id: 'high', label: '高' }]

const display = (id: Id) => (id === 'coordinator' ? '协调主持' : `${AGENTS[id].name}专家`)

function loadDraft(): Record<Id, AgentConfig> {
  try {
    return { ...DEFAULT_CONFIGS, ...JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') }
  } catch {
    return DEFAULT_CONFIGS
  }
}

const capCount = (c: AgentConfig) => c.tools.length + c.mcp.length + c.skills.length

function AgentCard({ id, cfg, state, selected, onClick }: { id: Id; cfg: AgentConfig; state: ViewState; selected: boolean; onClick: () => void }) {
  const Icon = AGENT_ICON[id]
  const v = state.agents[id]
  const busy = v.status === 'thinking' || v.status === 'tool' || v.status === 'waiting'
  return (
    <button onClick={onClick} className={`rounded-[9px] border bg-white p-4 text-left transition ${selected ? 'border-2 border-[#2d7df7] shadow-[0_0_0_2px_#edf5ff]' : 'border-line hover:border-[#cddbed]'}`}>
      <div className="flex items-start gap-2.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#edf4ff] text-[#1f72f0]"><Icon size={21} /></span>
        <div className="min-w-0">
          <b className="text-[16px]">{display(id)}</b>
          <div className="mt-1"><Badge tone={busy ? 'blue' : v.status === 'done' ? 'green' : 'gray'} dot>{STATUS[v.status]}</Badge></div>
        </div>
        <span className="ml-auto"><Badge>{id === 'coordinator' ? '流程主持' : '专业研判'}</Badge></span>
      </div>
      <p className="mt-3 text-[#556b87]">{AGENTS[id].role}{AGENTS[id].dataDomain && ` · 只能访问${AGENTS[id].dataDomain}`}</p>
      <div className="mt-2 flex gap-3.5 text-[11px] text-[#607593]">
        <span className="flex items-center gap-1"><Wrench size={11} />{capCount(cfg)} 项能力</span>
        <span className="flex items-center gap-1"><Database size={11} />{cfg.tools.filter((t) => CAPABILITIES.find((c) => c.id === t)?.kind === 'data').length} 个数据工具</span>
        <span className="flex items-center gap-1"><Bot size={11} />{cfg.model.split('/')[1]}</span>
      </div>
      <div className="mt-3 border-t border-[#edf1f6] pt-2.5 text-[11px] text-[#71849e]">
        本次会商：{v.tools.length} 次工具调用 · {(v.tokens.input + v.tokens.output).toLocaleString()} tokens
      </div>
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[110px_1fr] items-center gap-2.5 py-1.5 text-[13px]">
      <span className="text-[#4e6686]">{label}</span>
      {children}
    </label>
  )
}

const GROUPS: { kind: CapKind; key: 'tools' | 'mcp' | 'skills'; hint: string }[] = [
  { kind: 'data', key: 'tools', hint: '数据域隔离：只能勾选本专业的数据工具' },
  { kind: 'collab', key: 'tools', hint: '专家之间的协作动作' },
  { kind: 'flow', key: 'tools', hint: '只有协调主持可用' },
  { kind: 'mcp', key: 'mcp', hint: '外部系统接入，均为规划项' },
  { kind: 'skill', key: 'skills', hint: '可复用的会商流程' },
]

function CapabilityPicker({ cfg, onChange }: { cfg: AgentConfig; onChange: (c: AgentConfig) => void }) {
  return (
    <div className="space-y-4">
      {GROUPS.map((g) => {
        const caps = CAPABILITIES.filter((c) => c.kind === g.kind)
        return (
          <section key={g.kind}>
            <div className="mb-2 flex items-baseline gap-2">
              <h4 className="font-bold">{KIND_LABEL[g.kind]}</h4>
              <small className="text-[12px] text-muted">{g.hint}</small>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {caps.map((c) => {
                const allowed = c.agents.includes(cfg.id) && c.status !== 'planned'
                const on = cfg[g.key].includes(c.id)
                return (
                  <label key={c.id} className={`flex items-start gap-2 rounded-lg border p-2.5 ${on ? 'border-[#b9d2f6] bg-[#f7faff]' : 'border-[#e3ebf6]'} ${allowed ? 'cursor-pointer' : 'opacity-55'}`} title={allowed ? c.desc : c.status === 'planned' ? '规划中，尚未接入' : '该 Agent 无权使用'}>
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-brand"
                      checked={on}
                      disabled={!allowed}
                      onChange={() => onChange({ ...cfg, [g.key]: on ? cfg[g.key].filter((x) => x !== c.id) : [...cfg[g.key], c.id] })}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <b className="text-[13px]">{c.name}</b>
                        {c.status !== 'live' && <Badge tone="gray">{STATUS_LABEL[c.status]}</Badge>}
                        {!allowed && c.status === 'live' && <Lock size={11} className="text-faint" />}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-faint">{c.id}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function Usage({ id, state }: { id: Id; state: ViewState }) {
  const v = state.agents[id]
  const findings = state.findingOrder.map((f) => state.findings[f]).filter((f) => f.agentId === id)
  const sent = state.messages.filter((m) => m.from === id)
  const byTool = Object.entries(v.tools.reduce<Record<string, number>>((m, t) => ({ ...m, [t.label]: (m[t.label] ?? 0) + 1 }), {}))
  if (state.status === 'idle') return <p className="rounded-lg bg-paper-2 p-4 text-muted">还没有运行记录。开始一次会商后，这里显示该 Agent 的调用次数、token 用量和产出。</p>
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2 rounded-lg border border-[#e8edf4] bg-paper-2 p-3">
        {[['当前状态', STATUS[v.status]], ['工具调用', v.tools.length], ['输入 tokens', v.tokens.input.toLocaleString()], ['输出 tokens', v.tokens.output.toLocaleString()]].map(([k, x]) => (
          <div key={k}><span className="text-[11px] text-[#75859d]">{k}</span><b className="mt-1 block">{x}</b></div>
        ))}
      </div>
      <section>
        <h4 className="mb-2 font-bold">工具调用分布</h4>
        {byTool.length ? byTool.map(([k, n]) => (
          <div key={k} className="flex items-center gap-2 py-1">
            <span className="w-24 shrink-0 text-[#526983]">{k}</span>
            <span className="h-2 rounded-full bg-brand/70" style={{ width: `${(n / Math.max(...byTool.map((x) => x[1]))) * 60}%` }} />
            <span className="text-[12px] text-muted">{n}</span>
          </div>
        )) : <p className="text-muted">暂无</p>}
      </section>
      {id !== 'coordinator' && (
        <section>
          <h4 className="mb-2 font-bold">协作产出</h4>
          <p className="text-[#526983]">发布判断 {findings.length} 条 · 主动发言 {sent.length} 次 · 改口 {findings.reduce((n, f) => n + f.revisions.length, 0)} 次</p>
        </section>
      )}
    </div>
  )
}

export function AgentsPage({ state }: { state: ViewState }) {
  const [configs, setConfigs] = useState(loadDraft)
  const [saved, setSaved] = useState(configs)
  const [sel, setSel] = useState<Id>('coordinator')
  const [tab, setTab] = useState<'basic' | 'prompt' | 'caps' | 'rules' | 'usage'>('basic')
  const [q, setQ] = useState('')
  const [toast, setToast] = useState<string>()
  const cfg = configs[sel]
  const dirty = JSON.stringify(configs) !== JSON.stringify(saved)
  const set = (c: AgentConfig) => setConfigs({ ...configs, [c.id]: c })
  const running = IDS.filter((id) => ['thinking', 'tool', 'waiting'].includes(state.agents[id].status)).length
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(undefined), 2600) }
  const shown = IDS.filter((id) => !q || `${display(id)}${AGENTS[id].role}${AGENTS[id].dataDomain ?? ''}`.includes(q))

  const save = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(configs))
    setSaved(configs)
    flash('已保存为本地草稿。后端配置接口接入后才会作用于实际运行')
  }
  const reset = () => {
    set(DEFAULT_CONFIGS[sel])
    flash(`${display(sel)}已恢复为当前运行中的默认配置`)
  }

  return (
    <>
      <PageHead
        title="Agent 配置"
        desc="管理参与会商的 Agent：模型、system prompt、可用工具与数据权限、协作配额。默认值与当前实际运行的配置一致。"
        actions={
          <>
            {dirty && <span className="text-[13px] text-[#c87500]">有未保存的修改</span>}
            <Btn icon={RotateCcw} onClick={reset}>恢复默认</Btn>
            <Btn primary icon={Save} onClick={save} disabled={!dirty}>保存配置</Btn>
          </>
        }
      />
      <div className="mb-3 grid grid-cols-5 gap-2.5">
        <Kpi icon={Bot} label="Agent 总数" value={IDS.length} sub="1 位主持 + 4 位专家" />
        <Kpi icon={Activity} label="运行中" value={running} tone="green" sub={state.status === 'running' ? '会商进行中' : '当前无会商'} />
        <Kpi icon={Wrench} label="已注册工具" value={CAPABILITIES.filter((c) => ['data', 'collab', 'flow'].includes(c.kind)).length} sub="数据查询 · 协作 · 主持流程" />
        <Kpi icon={Database} label="数据源" value={CAPABILITIES.filter((c) => c.kind === 'source' && c.status !== 'missing').length} unit={`/ ${CAPABILITIES.filter((c) => c.kind === 'source').length}`} tone="orange" sub={`${CAPABILITIES.filter((c) => c.kind === 'source' && c.status === 'missing').length} 项尚未接入`} />
        <Kpi icon={Lock} label="数据域隔离" value="开启" tone="violet" sub="专家只能查本专业数据" />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_620px] gap-2.5">
        <div>
          <div className="relative mb-2.5">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索 Agent 名称、角色或数据域…" className="w-full rounded-[7px] border border-line bg-white py-2.5 pr-3 pl-9 outline-none focus:border-brand" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {shown.map((id) => <AgentCard key={id} id={id} cfg={configs[id]} state={state} selected={id === sel} onClick={() => setSel(id)} />)}
          </div>
        </div>

        <Card className="self-start">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-lg bg-[#edf4ff] text-[#1870ee]">{(() => { const I = AGENT_ICON[sel]; return <I size={18} /> })()}</span>
              <span className="text-[18px] font-bold">{display(sel)}</span>
            </div>
            <Badge tone="green" dot>已启用</Badge>
          </div>
          <p className="mt-2 text-[#526983]">{AGENTS[sel].role}{AGENTS[sel].dataDomain ? `，只能访问${AGENTS[sel].dataDomain}的数据` : '，不访问任何数据，只组织讨论、形成结论'}</p>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[{ id: 'basic', label: '基本信息' }, { id: 'prompt', label: '指令配置' }, { id: 'caps', label: '工具与能力' }, { id: 'rules', label: '协作规则' }, { id: 'usage', label: '运行情况' }]}
          />

          {tab === 'basic' && (
            <div>
              <Field label="名称"><input className={inputCls} value={display(sel)} readOnly /></Field>
              <Field label="角色"><input className={inputCls} value={AGENTS[sel].role} readOnly /></Field>
              <Field label="数据权限"><span className="flex flex-wrap gap-1.5">{AGENTS[sel].dataDomain ? AGENTS[sel].dataDomain.split(' / ').map((d) => <Badge key={d}>{d}</Badge>) : <Badge tone="gray">无（只读协作板）</Badge>}</span></Field>
              <Field label="模型">
                <select className={selectCls} value={cfg.model} onChange={(e) => set({ ...cfg, model: e.target.value })}>
                  {MODELS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label="思考强度">
                <span className="flex gap-1 rounded-lg border border-line p-[3px]">
                  {THINKING.map((t) => (
                    <button key={t.id} onClick={() => set({ ...cfg, thinkingLevel: t.id })} className={`flex-1 rounded-md px-3 py-1.5 ${cfg.thinkingLevel === t.id ? 'bg-brand text-white' : 'text-[#60718e]'}`}>{t.label}</button>
                  ))}
                </span>
              </Field>
              <Field label="凭证"><span className="text-[13px] text-muted">由服务端读取环境变量或本机 pi 登录信息，不在前端配置</span></Field>
            </div>
          )}

          {tab === 'prompt' && (
            <div>
              <div className="mb-2 flex items-center justify-between text-[13px]">
                <span className="text-[#4e6686]">System Prompt</span>
                <span className="text-muted">{cfg.systemPrompt.length} 字</span>
              </div>
              <textarea value={cfg.systemPrompt} onChange={(e) => set({ ...cfg, systemPrompt: e.target.value })} className={`${inputCls} h-[360px] resize-y font-mono text-[12.5px] leading-relaxed`} />
              <p className="mt-2 text-[12px] text-muted">各阶段的任务说明（如「背靠背独立研判」「逐条检验同伴判断」）由会商流程在运行时追加，不在这里配置。</p>
            </div>
          )}

          {tab === 'caps' && <CapabilityPicker cfg={cfg} onChange={set} />}

          {tab === 'rules' && (
            <div>
              {sel !== 'coordinator' ? (
                <>
                  <Field label="向现场提问"><span className="flex items-center gap-2"><input type="number" min={0} max={3} className={`${inputCls} w-20`} value={cfg.quotas.askHuman} onChange={(e) => set({ ...cfg, quotas: { ...cfg.quotas, askHuman: Number(e.target.value) } })} /><span className="text-muted">次 / 每场（全队上限 2 次）</span></span></Field>
                  <Field label="向同伴追问"><span className="flex items-center gap-2"><input type="number" min={0} max={5} className={`${inputCls} w-20`} value={cfg.quotas.askPeerPerStage} onChange={(e) => set({ ...cfg, quotas: { ...cfg.quotas, askPeerPerStage: Number(e.target.value) } })} /><span className="text-muted">次 / 每阶段</span></span></Field>
                </>
              ) : (
                <Field label="专项会商"><span className="flex items-center gap-2"><input type="number" min={0} max={4} className={`${inputCls} w-20`} value={cfg.quotas.sessions} onChange={(e) => set({ ...cfg, quotas: { ...cfg.quotas, sessions: Number(e.target.value) } })} /><span className="text-muted">轮上限，一轮结束再开下一轮</span></span></Field>
              )}
              <Field label="参与阶段">
                <span className="flex flex-wrap gap-1.5">
                  {STAGES.filter((s) => s.id !== 'snapshot' && s.id !== 'approval').map((s) => {
                    const on = cfg.stages.includes(s.id)
                    return (
                      <button key={s.id} onClick={() => set({ ...cfg, stages: on ? cfg.stages.filter((x) => x !== s.id) : [...cfg.stages, s.id as Stage] })} className={`rounded-[5px] px-2.5 py-1.5 text-[12px] ${on ? 'bg-[#edf4ff] text-[#2a67bd]' : 'bg-[#eef1f5] text-faint line-through'}`}>
                        {s.label}
                      </button>
                    )
                  })}
                </span>
              </Field>
              <div className="mt-3 rounded-lg border border-[#cdeedf] bg-[#eefaf5] p-3 text-[13px] leading-relaxed text-[#3d6554]">
                <b className="text-[#0c9e65]">固定规则（不可关闭）</b>
                <ul className="mt-1 list-disc pl-5">
                  <li>判断必须引用证据编号，引用不存在的编号会被拒绝</li>
                  <li>不能对自己的判断表态，只能修改自己的判断</li>
                  <li>平台只给建议，不向设备下发任何控制指令</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'usage' && <Usage id={sel} state={state} />}
        </Card>
      </div>
      {toast && <div className="fixed right-6 bottom-6 z-50 rounded-lg bg-[#0f2748] px-[18px] py-3 text-white shadow-lg">{toast}</div>}
    </>
  )
}
