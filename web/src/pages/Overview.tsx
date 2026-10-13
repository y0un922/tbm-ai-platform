// 总览：TBM-01 当前掘进状态。KPI、趋势、异常都由 /api/data/rings 的逐环数据算出，不写死
import { AGENTS, type AgentId, type RingPoint } from '@tbm/shared'
import { ArrowRight, Bot, CircleAlert, Gauge, Layers, Network, RotateCw, TrendingDown, Waves } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Btn, Card, CardTitle, Kpi, PageHead, type Tone } from '../components/kit.tsx'
import { AGENT_ICON, STATUS } from '../components/labels.ts'
import { CAPABILITIES, STATUS_LABEL } from '../data/catalog.ts'
import { source } from '../data/index.ts'
import { BASE_RINGS, avg, onset } from '../data/rings.ts'
import type { Run } from '../state/useRun.ts'

const FROM = 500, TO = 540

interface Alert { level: 'high' | 'mid' | 'low'; title: string; detail: string; ring?: number }

const pct = (a: number, b: number) => Math.round(((a - b) / b) * 100)

function analyse(rings: RingPoint[]) {
  const base = rings.slice(0, BASE_RINGS)
  const b = { speed: avg(base.map((r) => r.advanceSpeed)), torque: avg(base.map((r) => r.torque)), fir: avg(base.map((r) => r.fir)), thrust: avg(base.map((r) => r.thrust)) }
  const last = rings.at(-1)!
  const alerts: Alert[] = []
  const fir = onset(rings, (r) => r.fir < b.fir * 0.7)
  if (fir) alerts.push({ level: 'high', ring: fir.ring, title: '泡沫注入率骤降', detail: `${fir.ring} 环起 FIR 由 ${(b.fir * 100).toFixed(0)}% 降至 ${(fir.fir * 100).toFixed(0)}%，至今未恢复` })
  const speed = onset(rings, (r) => r.advanceSpeed < b.speed * 0.85)
  if (speed) alerts.push({ level: 'high', ring: speed.ring, title: '推进速度下降', detail: `${speed.ring} 环起持续低于基线 15% 以上，当前 ${pct(last.advanceSpeed, b.speed)}%` })
  const torque = onset(rings, (r) => r.torque > b.torque * 1.08)
  if (torque) alerts.push({ level: 'mid', ring: torque.ring, title: '刀盘扭矩上升', detail: `${torque.ring} 环起持续偏高，当前较基线 +${pct(last.torque, b.torque)}%` })
  const gravel = onset(rings, (r) => r.gravelContent > 0)
  if (gravel) alerts.push({ level: 'mid', ring: gravel.ring, title: '进入含卵石地层', detail: `${gravel.ring} 环起出现卵石，当前含量 ${Math.round(last.gravelContent * 100)}%` })
  const missing = CAPABILITIES.filter((c) => c.kind === 'source' && c.status === 'missing')
  if (missing.length) alerts.push({ level: 'low', title: '数据缺口', detail: `${missing.map((c) => c.name).join('、')}未接入，相关判断需现场确认` })
  return { base: b, last, alerts }
}

const LEVEL: Record<Alert['level'], { label: string; tone: Tone }> = { high: { label: '高', tone: 'red' }, mid: { label: '中', tone: 'orange' }, low: { label: '低', tone: 'blue' } }

export function OverviewPage({ run }: { run: Run }) {
  const [rings, setRings] = useState<RingPoint[]>([])
  const [error, setError] = useState<string>()
  useEffect(() => {
    source.rings(FROM, TO).then(setRings, (e) => setError(String(e)))
  }, [])
  const a = useMemo(() => (rings.length ? analyse(rings) : undefined), [rings])
  const { state } = run
  const chart = rings.map((r) => ({ ring: r.ring, speed: r.advanceSpeed, fir: Math.round(r.fir * 1000) / 10, torque: r.torque, gravel: Math.round(r.gravelContent * 100) }))
  const sources = CAPABILITIES.filter((c) => c.kind === 'source')

  if (!a) return <PageHead title="项目总览" desc={error ? `掘进数据加载失败：${error}` : '正在加载掘进数据…'} />

  return (
    <>
      <PageHead
        title="项目总览"
        desc={`TBM-01 · 监测区间 ${FROM}–${TO} 环 · 实时掌握掘进状态与异常，异常时由多专家 AI 会商定位原因`}
        actions={<Btn primary icon={Network} onClick={() => (location.hash = '#/collab')}>发起 AI 会商</Btn>}
      />

      <div className="mb-3 grid grid-cols-5 gap-2.5">
        <Kpi icon={RotateCw} label="当前环号" value={a.last.ring} sub={`监测区间 ${FROM}–${TO} 环`} />
        <Kpi icon={TrendingDown} label="推进速度" value={a.last.advanceSpeed} unit="mm/min" tone="red" sub={<span className="text-bad">{pct(a.last.advanceSpeed, a.base.speed)}%（较 {FROM}–{FROM + BASE_RINGS - 1} 环基线）</span>} />
        <Kpi icon={Gauge} label="刀盘扭矩" value={a.last.torque.toLocaleString()} unit="kN·m" tone="orange" sub={<span className="text-[#c87500]">+{pct(a.last.torque, a.base.torque)}%（较基线）</span>} />
        <Kpi icon={Waves} label="泡沫注入率 FIR" value={(a.last.fir * 100).toFixed(1)} unit="%" tone="red" sub={`基线 ${(a.base.fir * 100).toFixed(1)}%`} />
        <Kpi icon={CircleAlert} label="风险告警" value={a.alerts.length} tone="orange" sub={`${a.alerts.filter((x) => x.level === 'high').length} 条高风险 · ${a.alerts.filter((x) => x.level === 'mid').length} 条中风险`} />
      </div>

      <div className="mb-2.5 grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2.5">
        <Card>
          <CardTitle sub={`${FROM}–${TO} 环 · 虚线为告警起点，详见右侧`}>关键指标趋势</CardTitle>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chart} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#e9eef5" vertical={false} />
              <XAxis dataKey="ring" stroke="#7789a4" fontSize={11} tickLine={false} />
              <YAxis yAxisId="l" stroke="#7789a4" fontSize={11} tickLine={false} axisLine={false} width={36} />
              <YAxis yAxisId="r" orientation="right" stroke="#7789a4" fontSize={11} tickLine={false} axisLine={false} width={44} domain={['dataMin - 200', 'dataMax + 200']} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e4eaf2', borderRadius: 8, fontSize: 12 }} labelFormatter={(r) => `${r} 环`} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#526985' }} />
              {/* 同一环可能有多条告警，每环只画一条线，取最高级别 */}
              {[...new Set(a.alerts.flatMap((x) => (x.ring ? [x.ring] : [])))].map((ring) => {
                const high = a.alerts.some((x) => x.ring === ring && x.level === 'high')
                return <ReferenceLine key={ring} yAxisId="l" x={ring} stroke={high ? '#ef4444' : '#f59e0b'} strokeDasharray="4 3" label={{ value: `${ring} 环`, position: 'insideTopLeft', fontSize: 11, fill: high ? '#ef4444' : '#c87500' }} />
              })}
              <Line yAxisId="l" dataKey="speed" name="推进速度 mm/min" stroke="#3478f6" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line yAxisId="l" dataKey="fir" name="FIR %" stroke="#23ac78" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              <Line yAxisId="l" dataKey="gravel" name="卵石含量 %" stroke="#8b98ac" strokeWidth={1.5} strokeDasharray="5 4" dot={false} type="stepAfter" isAnimationActive={false} />
              <Line yAxisId="r" dataKey="torque" name="刀盘扭矩 kN·m（右轴）" stroke="#f28c28" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <CardTitle sub="按逐环数据自动识别">风险与异常</CardTitle>
          <div className="flex flex-col gap-2">
            {a.alerts.map((x) => (
              <div key={x.title} className="rounded-lg bg-paper-2 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <b>{x.title}</b>
                  <Badge tone={LEVEL[x.level].tone}>{LEVEL[x.level].label}</Badge>
                </div>
                <small className="mt-1 block text-[12px] text-[#71839f]">{x.detail}</small>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2.5">
        <Card>
          <CardTitle sub={state.conclusion ? '由多专家会商得出，经负责人审核' : undefined} right={<a href="#/collab" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand">查看会商 <ArrowRight size={13} /></a>}>
            AI 会商结论
          </CardTitle>
          {state.conclusion ? (
            <>
              <div className="flex gap-2.5 rounded-lg border border-[#e7eff9] bg-[#f7faff] p-3.5">
                <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-[#eaf3ff] text-[#186cf0]"><Bot size={18} /></span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><Badge tone="red">主因</Badge>{state.review && <Badge tone={state.review.decision === 'approve' ? 'green' : 'gray'}>{state.review.decision === 'approve' ? '已批准' : '已驳回'}</Badge>}</div>
                  <p className="mt-1.5 leading-relaxed text-[#36506f]">{state.conclusion.conclusion.primary.cause}</p>
                </div>
              </div>
              <div className="mt-3 font-bold">建议措施</div>
              <ul className="mt-1.5 space-y-1.5">
                {state.conclusion.conclusion.actions.slice(0, 4).map((x) => <li key={x} className="flex gap-2 text-[#526983]"><span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-ok" />{x}</li>)}
              </ul>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-paper-2 py-10 text-muted">
              <Network size={28} className="text-faint" />
              {state.status === 'running' ? '会商进行中，结论起草后显示在这里' : '还没有会商结论。发现异常后可发起 AI 会商，由四位专家协同定位原因'}
              {state.status !== 'running' && <Btn icon={Network} onClick={() => (location.hash = '#/collab')}>去发起会商</Btn>}
            </div>
          )}
        </Card>
        <Card>
          <CardTitle right={<a href="#/agents" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand">配置 <ArrowRight size={13} /></a>}>Agent 状态</CardTitle>
          <div className="divide-y divide-[#edf0f5]">
            {(['coordinator', 'geology', 'boring', 'cutter', 'muck'] as AgentId[]).map((id) => {
              const Icon = AGENT_ICON[id]
              const v = state.agents[id]
              const busy = v.status === 'thinking' || v.status === 'tool' || v.status === 'waiting'
              return (
                <div key={id} className="flex items-center gap-2.5 py-2">
                  <span className="grid size-8 place-items-center rounded-full bg-[#edf4ff] text-[#1f72f0]"><Icon size={16} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{AGENTS[id].name}{id === 'coordinator' ? '' : '专家'}</div>
                    <div className="truncate text-[12px] text-muted">{AGENTS[id].dataDomain ?? AGENTS[id].role}</div>
                  </div>
                  <Badge tone={busy ? 'blue' : v.status === 'done' ? 'green' : v.status === 'error' ? 'red' : 'gray'} dot>{STATUS[v.status]}</Badge>
                </div>
              )
            })}
          </div>
        </Card>
        <Card>
          <CardTitle right={<a href="#/tools" className="flex items-center gap-0.5 text-[12px] font-semibold text-brand">全部 <ArrowRight size={13} /></a>}>数据源</CardTitle>
          <div className="divide-y divide-[#edf0f5]">
            {sources.map((c) => (
              <div key={c.id} className="flex items-center gap-2.5 py-2">
                <Layers size={15} className="shrink-0 text-faint" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{c.name}</div>
                  <div className="truncate text-[12px] text-muted">{c.desc}</div>
                </div>
                <Badge tone={c.status === 'live' ? 'green' : c.status === 'partial' ? 'orange' : 'gray'} dot>{STATUS_LABEL[c.status]}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
