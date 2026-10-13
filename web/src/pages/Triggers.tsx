// 触发规则：会商由谁、在什么条件下发起。手动 / 数据规则 / 定时任务 / 报警联动。
// 规则命中用 /api/data/rings 的逐环数据在前端评估；配置只存本地草稿，后端尚无触发器接口
import { AGENTS, SPECIALISTS, type CreateRunRequest, type RingPoint } from '@tbm/shared'
import { AlarmClock, BellRing, CalendarClock, Hand, Info, Play, Plus, RotateCcw, Save, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Btn, Card, inputCls, Kpi, PageHead, selectCls, Tabs, type Tone } from '../components/kit.tsx'
import { clock } from '../components/ui.tsx'
import { source } from '../data/index.ts'
import { BASE_RINGS, avg } from '../data/rings.ts'
import {
  DEFAULT_TRIGGERS, KIND_LABEL, METRICS, describe, evaluateRule, fillQuestion, loadTriggers, nextRuns, resetTriggers, saveTriggers,
  type Metric, type RuleHit, type Trigger, type TriggerKind,
} from '../data/triggers.ts'
import type { Run } from '../state/useRun.ts'

export const KIND_STYLE: Record<TriggerKind, { tone: Tone; icon: LucideIcon }> = {
  manual: { tone: 'blue', icon: Hand },
  rule: { tone: 'orange', icon: Zap },
  schedule: { tone: 'violet', icon: CalendarClock },
  event: { tone: 'cyan', icon: BellRing },
}

const narrowCls = inputCls.replace('w-full', 'w-20')
const hhmm = (d: Date) => `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const fmt = (m: Metric, v: number) => `${(v * METRICS[m].scale).toFixed(METRICS[m].scale > 1 ? 1 : 0)}${METRICS[m].unit === '%' ? '%' : ` ${METRICS[m].unit}`}`

function Switch({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!on) }}
      className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${on ? 'bg-brand' : 'bg-[#cfd8e5]'}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid grid-cols-[96px_1fr] items-center gap-2.5 py-1.5 text-[13px]">
      <span className="text-[#4e6686]">{label}</span>
      {children}
    </label>
  )
}

/** 表格里"状态 / 最近命中"一列 */
function Hit({ t, hit, now }: { t: Trigger; hit?: RuleHit; now: Date }) {
  if (t.planned) return <Badge tone="gray">待接入</Badge>
  if (t.rule) {
    if (!hit) return <span className="text-muted">未命中</span>
    return (
      <span className="flex flex-col">
        <span className="font-semibold text-bad">{hit.start} 环起命中</span>
        <span className="text-[11px] text-muted">{hit.fired} 环确认 · 当前 {fmt(t.rule.metric, hit.current)}</span>
      </span>
    )
  }
  if (t.schedule) {
    const [next] = nextRuns(t.schedule, now)
    return next ? <span className="flex flex-col"><span className="text-ink-2">下次 {hhmm(next)}</span><span className="text-[11px] text-muted">{t.enabled ? '已排程' : '已停用，不会执行'}</span></span> : null
  }
  return <span className="text-muted">随时</span>
}

function Preview({ t, rings, hit }: { t: Trigger; rings: RingPoint[]; hit?: RuleHit }) {
  if (t.rule) {
    const m = t.rule.metric
    const k = METRICS[m].scale
    const data = rings.map((r) => ({ ring: r.ring, v: Math.round(r[m] * k * 10) / 10 }))
    const threshold = avg(rings.slice(0, BASE_RINGS).map((r) => r[m])) * t.rule.ratio
    return (
      <div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 10, right: 12, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#e9eef5" vertical={false} />
            <XAxis dataKey="ring" tick={{ fontSize: 11, fill: '#6d7d97' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6d7d97' }} domain={['auto', 'auto']} />
            <Tooltip formatter={(v) => [`${v} ${METRICS[m].unit}`, METRICS[m].label]} labelFormatter={(r) => `${r} 环`} />
            {hit && <ReferenceArea x1={hit.start} x2={rings.at(-1)!.ring} fill="#ef4444" fillOpacity={0.06} />}
            <ReferenceLine y={Math.round(threshold * k * 10) / 10} stroke="#ef4444" strokeDasharray="5 4" label={{ value: `阈值 ${Math.round(t.rule.ratio * 100)}%`, position: 'insideTopRight', fontSize: 11, fill: '#ef4444' }} />
            {hit && <ReferenceLine x={hit.fired} stroke="#136ff3" label={{ value: `${hit.fired} 环触发`, position: 'insideTopLeft', fontSize: 11, fill: '#136ff3' }} />}
            <Line dataKey="v" stroke="#0c2347" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
          {hit
            ? <>基线（前 10 环均值）{fmt(m, hit.base)}，阈值 {fmt(m, hit.threshold)}。<b className="text-bad">{hit.start} 环</b>起连续 {t.rule.persist} 环{t.rule.op === 'below' ? '低于' : '高于'}阈值，于 <b className="text-brand">{hit.fired} 环</b>满足触发条件。</>
            : '当前数据未满足触发条件。'}
        </p>
      </div>
    )
  }
  if (t.schedule) {
    return (
      <div>
        <div className="mb-2 text-[13px] text-muted">接下来 5 次执行</div>
        <ul className="space-y-1.5">
          {nextRuns(t.schedule, new Date(), 5).map((d) => <li key={+d} className="flex items-center gap-2 text-[13px]"><AlarmClock size={14} className="text-[#7551d7]" />{hhmm(d)}</li>)}
        </ul>
      </div>
    )
  }
  if (t.event) return <p className="text-[13px] leading-relaxed text-muted">报警联动依赖设备报警 MCP 推送报警事件。接入后，这里会显示最近收到的报警及是否命中所配报警码。</p>
  return <p className="text-[13px] text-muted">手动触发没有条件，由用户在 AI 协同页随时发起。</p>
}

export function TriggersPage({ run }: { run: Run }) {
  const [triggers, setTriggers] = useState(loadTriggers)
  const [saved, setSaved] = useState(triggers)
  const [sel, setSel] = useState(triggers[1]?.id ?? triggers[0].id)
  const [filter, setFilter] = useState<TriggerKind | 'all'>('all')
  const [tab, setTab] = useState<'config' | 'preview' | 'history'>('config')
  const [rings, setRings] = useState<RingPoint[]>([])
  const [toast, setToast] = useState<string>()
  const now = new Date()
  useEffect(() => { source.rings(500, 540).then(setRings, () => setRings([])) }, [])

  const hits = useMemo(() => Object.fromEntries(triggers.map((t) => [t.id, t.rule ? evaluateRule(rings, t.rule) : undefined])), [triggers, rings])
  const t = triggers.find((x) => x.id === sel) ?? triggers[0]
  const dirty = JSON.stringify(triggers) !== JSON.stringify(saved)
  const running = run.state.status === 'running'
  const flash = (s: string) => { setToast(s); setTimeout(() => setToast(undefined), 2600) }
  const set = (patch: Partial<Trigger>) => setTriggers(triggers.map((x) => (x.id === t.id ? { ...x, ...patch } : x)))
  const toggle = (id: string, enabled: boolean) => setTriggers(triggers.map((x) => (x.id === id ? { ...x, enabled } : x)))
  const shown = triggers.filter((x) => filter === 'all' || x.kind === filter)
  const lastRing = rings.at(-1)?.ring ?? 540
  const nextCron = triggers.filter((x) => x.schedule && x.enabled).flatMap((x) => nextRuns(x.schedule!, now).map((d) => ({ d, x }))).sort((a, b) => +a.d - +b.d)[0]

  const fire = (x: Trigger) => {
    // 人工发起要填问题和原因，交给 AI 协同页的发起对话框
    if (x.kind === 'manual') { location.hash = '#/collab?new'; return }
    const hit = hits[x.id]
    const reason = hit ? `${describe(x)}：${hit.start} 环起命中，${hit.fired} 环确认`
      : x.kind === 'schedule' ? `${describe(x)}（手动立即执行）` : `${describe(x)}（试运行，当前未命中）`
    const trigger = { kind: x.kind, id: x.id, name: x.name, reason }
    const req: CreateRunRequest = source.kind === 'local'
      ? { mode: 'replay', speed: 1, trigger }
      : { mode: 'live', question: fillQuestion(x, hit?.start ?? lastRing), trigger }
    run.start(req)
    location.hash = '#/collab'
  }
  const add = () => {
    const id = `rule-${Date.now().toString(36)}`
    const base = DEFAULT_TRIGGERS.find((d) => d.id === 'rule-speed')!
    setTriggers([...triggers, { ...base, id, name: '新建数据规则', enabled: false, desc: '自定义数据规则' }])
    setSel(id)
    setTab('config')
  }

  return (
    <>
      <PageHead
        title="触发规则"
        desc="会商可以由人手动发起，也可以在数据异常、定时巡检或设备报警时自动发起。触发只负责发起会商，结论仍需负责人审核，不下发设备指令。"
        actions={
          <>
            {dirty && <span className="text-[13px] text-[#c87500]">有未保存的修改</span>}
            <Btn icon={Plus} onClick={add}>新建规则</Btn>
            <Btn icon={RotateCcw} onClick={() => { resetTriggers(); setTriggers(DEFAULT_TRIGGERS); setSaved(DEFAULT_TRIGGERS); flash('已恢复默认触发规则') }}>恢复默认</Btn>
            <Btn primary icon={Save} disabled={!dirty} onClick={() => { saveTriggers(triggers); setSaved(triggers); flash('已保存为本地草稿。后端触发器接口接入后才会真正按规则自动发起') }}>保存配置</Btn>
          </>
        }
      />

      <div className="mb-3 grid grid-cols-5 gap-2.5">
        <Kpi icon={Zap} label="触发器" value={triggers.length} sub={`${triggers.filter((x) => x.enabled).length} 个已启用`} />
        <Kpi icon={BellRing} label="当前命中" value={triggers.filter((x) => x.enabled && hits[x.id]).length} tone="red" sub="按 500–540 环数据评估" />
        <Kpi icon={CalendarClock} label="下次定时" value={nextCron ? hhmm(nextCron.d).split(' ')[1] : '—'} tone="violet" sub={nextCron ? nextCron.x.name : '无启用的定时任务'} />
        <Kpi icon={Info} label="待接入" value={triggers.filter((x) => x.planned).length} tone="gray" sub="报警联动依赖设备报警 MCP" />
        <Kpi icon={Play} label="本次已发起" value={run.launches.length} tone="green" sub="本页面会话内" />
      </div>

      <div className="mb-2.5 flex items-start gap-2 rounded-[8px] border border-[#cfe0fb] bg-brand-soft px-3.5 py-2.5 text-[13px] text-[#2a5a9e]">
        <Info size={15} className="mt-0.5 shrink-0" />
        发起会商时，问题模板填好后作为会商问题、触发原因作为来源一起提交给后端（真实运行生效；回放样本的问题固定）。专家只能查到 500–540 环的数据。触发器配置目前只存本地草稿，「命中后自动发起」与定时执行需要后端调度器，参与专家暂不生效。
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_480px] gap-2.5">
        <Card className="p-0">
          <div className="flex gap-1.5 border-b border-line px-4 py-3">
            {(['all', 'manual', 'rule', 'schedule', 'event'] as const).map((k) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-[6px] px-3 py-1.5 text-[13px] ${filter === k ? 'bg-brand font-bold text-white' : 'bg-paper text-[#46607f] hover:bg-brand-soft'}`}>
                {k === 'all' ? '全部' : KIND_LABEL[k]} {k === 'all' ? triggers.length : triggers.filter((x) => x.kind === k).length}
              </button>
            ))}
          </div>
          <table className="w-full text-[13px]">
            <thead className="bg-paper-2 text-left text-[12px] text-muted">
              <tr>
                <th className="py-2.5 pl-4 font-semibold">名称</th>
                <th className="font-semibold">类型</th>
                <th className="font-semibold">触发条件</th>
                <th className="font-semibold">启用</th>
                <th className="font-semibold">命中 / 下次执行</th>
                <th className="pr-4 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((x) => {
                const k = KIND_STYLE[x.kind]
                return (
                  <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer border-t border-line ${x.id === t.id ? 'bg-brand-soft/70' : 'hover:bg-paper-2'}`}>
                    <td className="py-3 pl-4">
                      <div className="font-bold text-ink">{x.name}</div>
                      <div className="mt-0.5 max-w-[300px] truncate text-[12px] text-muted">{x.desc}</div>
                    </td>
                    <td><Badge tone={k.tone}><k.icon size={11} />{KIND_LABEL[x.kind]}</Badge></td>
                    <td className="max-w-[260px] pr-3 text-ink-2">{describe(x)}</td>
                    <td><Switch on={x.enabled} disabled={x.planned} onChange={(v) => toggle(x.id, v)} /></td>
                    <td><Hit t={x} hit={hits[x.id]} now={now} /></td>
                    <td className="pr-4 text-right">
                      <button
                        disabled={running || x.planned}
                        onClick={(e) => { e.stopPropagation(); fire(x) }}
                        className="rounded-[6px] border border-line px-2.5 py-1 font-semibold whitespace-nowrap text-brand hover:border-brand disabled:opacity-40"
                        title={running ? '已有会商在进行' : undefined}
                      >
                        {x.kind === 'rule' ? (hits[x.id] ? '按命中发起' : '试运行') : x.kind === 'schedule' ? '立即执行' : x.kind === 'manual' ? '去发起' : '发起会商'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <div className="flex items-center gap-2.5">
            <Badge tone={KIND_STYLE[t.kind].tone}>{KIND_LABEL[t.kind]}</Badge>
            <b className="truncate text-[17px]">{t.name}</b>
            <span className="ml-auto flex items-center gap-2 text-[12px] text-muted">{t.planned ? '待接入' : t.enabled ? '已启用' : '已停用'}<Switch on={t.enabled} disabled={t.planned} onChange={(v) => set({ enabled: v })} /></span>
          </div>
          <Tabs tabs={[{ id: 'config', label: '触发配置' }, { id: 'preview', label: t.rule ? '命中预览' : '执行预览' }, { id: 'history', label: '触发记录' }]} value={tab} onChange={setTab} />

          {tab === 'config' && (
            <div>
              <Field label="名称"><input className={inputCls} value={t.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              {t.rule && (
                <>
                  <Field label="监测指标">
                    <select className={selectCls} value={t.rule.metric} onChange={(e) => set({ rule: { ...t.rule!, metric: e.target.value as Metric } })}>
                      {(Object.keys(METRICS) as Metric[]).map((m) => <option key={m} value={m}>{METRICS[m].label}</option>)}
                    </select>
                  </Field>
                  <Field label="条件">
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <select className={selectCls} value={t.rule.op} onChange={(e) => set({ rule: { ...t.rule!, op: e.target.value as 'below' | 'above' } })}>
                        <option value="below">低于</option>
                        <option value="above">高于</option>
                      </select>
                      基线的
                      <input type="number" className={narrowCls} value={Math.round(t.rule.ratio * 100)} onChange={(e) => set({ rule: { ...t.rule!, ratio: Number(e.target.value) / 100 } })} />%
                    </span>
                  </Field>
                  <Field label="持续">
                    <span className="flex items-center gap-2 whitespace-nowrap" title="避免单环抖动误报">连续<input type="number" min={1} className={narrowCls} value={t.rule.persist} onChange={(e) => set({ rule: { ...t.rule!, persist: Math.max(1, Number(e.target.value)) } })} />环满足才触发</span>
                  </Field>
                </>
              )}
              {t.schedule && (
                <>
                  <Field label="周期">
                    <select className={selectCls} value={t.schedule.cycle} onChange={(e) => set({ schedule: { ...t.schedule!, cycle: e.target.value as 'daily' } })}>
                      <option value="daily">每天</option>
                      <option value="weekday">工作日</option>
                      <option value="monday">每周一</option>
                    </select>
                  </Field>
                  <Field label="时间">
                    <input className={inputCls} value={t.schedule.times.join(', ')} onChange={(e) => set({ schedule: { ...t.schedule!, times: e.target.value.split(/[,，\s]+/).filter((s) => /^\d{1,2}:\d{2}$/.test(s)) } })} placeholder="07:30, 19:30" />
                  </Field>
                </>
              )}
              {t.event && (
                <>
                  <Field label="报警来源"><input className={inputCls} value={t.event.source} disabled /></Field>
                  <Field label="报警码"><input className={inputCls} value={t.event.codes} onChange={(e) => set({ event: { ...t.event!, codes: e.target.value } })} /></Field>
                </>
              )}
              {t.kind !== 'manual' && (
                <Field label="命中后">
                  <select className={selectCls} value={t.onFire} onChange={(e) => set({ onFire: e.target.value as 'auto' | 'confirm' })}>
                    <option value="confirm">通知值班人员，确认后发起</option>
                    <option value="auto">自动发起会商</option>
                  </select>
                </Field>
              )}
              <Field label="参与专家">
                <span className="flex flex-wrap gap-3">
                  {SPECIALISTS.map((a) => (
                    <label key={a} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={t.experts.includes(a)} onChange={(e) => set({ experts: e.target.checked ? [...t.experts, a] : t.experts.filter((x) => x !== a) })} />
                      {AGENTS[a].name}
                    </label>
                  ))}
                </span>
              </Field>
              <div className="mt-2 text-[13px] text-[#4e6686]">会商问题模板 <span className="text-[11px] text-faint">可用变量 {'{ring}'} {'{metric}'}</span></div>
              <textarea className={`${inputCls} mt-1.5 h-20 resize-none leading-relaxed`} value={t.question} onChange={(e) => set({ question: e.target.value })} />
              <div className="mt-1.5 rounded-[6px] bg-paper-2 px-3 py-2 text-[12px] text-muted">示例：{fillQuestion(t, hits[t.id]?.start ?? lastRing)}</div>
            </div>
          )}

          {tab === 'preview' && (rings.length ? <Preview t={t} rings={rings} hit={hits[t.id]} /> : <p className="text-muted">正在加载逐环数据…</p>)}

          {tab === 'history' && (
            <ul className="space-y-2">
              {run.launches.filter((l) => l.id === t.id).reverse().map((l) => (
                <li key={l.runId} className="rounded-[8px] border border-line px-3 py-2.5 text-[13px]">
                  <div className="flex items-center gap-2">
                    <Badge tone="green" dot>已发起</Badge>
                    <span className="font-mono text-[12px] text-muted">{l.runId}</span>
                    <span className="ml-auto text-[12px] text-faint">{new Date(l.at).toLocaleTimeString('zh-CN', { hour12: false })}</span>
                  </div>
                  <div className="mt-1.5 text-ink-2">{l.reason}</div>
                  {run.runId === l.runId && run.state.startedAt && (
                    <a href="#/collab" className="mt-1.5 inline-block text-[12px] text-brand hover:underline">
                      查看会商 · {run.state.status === 'running' ? `进行中 ${clock((run.state.now ?? 0) - run.state.startedAt)}` : '已结束'}
                    </a>
                  )}
                </li>
              ))}
              {!run.launches.some((l) => l.id === t.id) && <li className="py-8 text-center text-muted">本次打开页面后，这个触发器还没有发起过会商</li>}
            </ul>
          )}
        </Card>
      </div>
      {toast && <div className="fixed right-6 bottom-6 z-50 rounded-lg bg-[#0f2748] px-[18px] py-3 text-white shadow-lg">{toast}</div>}
    </>
  )
}
