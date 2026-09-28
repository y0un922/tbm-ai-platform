import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardSnapshot, RiskItem, TrendSeries } from '@/types'
import { AppLink } from '@/app/router'
import { Badge, Card, CardHeader, EmptyState, SeverityText } from '@/components/ui/primitives'
import { formatRelative } from '@/utils/format'

const COLORS = ['#6366f1', '#10b981', '#f59e0b']

export function TrendCard({ series }: { series: TrendSeries[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader title="关键指标趋势" sub="各自量纲，来自项目快照，不是前端计算的 PLC 阈值" extra={<span className="text-xs text-gray-400">近 30 环</span>} />
      <div className="grid gap-3 p-4 md:grid-cols-3">
        {series.length === 0 && <EmptyState title="没有趋势" body="该项目还没有遥测快照。" />}
        {series.map((item, index) => {
          const last = item.points.at(-1)?.y
          return (
            <div key={item.id}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                <span className="font-medium text-gray-700">{item.name}</span>
                <span className="tabular-nums text-gray-500">{last ?? '—'} {item.unit}</span>
              </div>
              <ResponsiveContainer width="100%" height={132}>
                <LineChart data={item.points}>
                  <CartesianGrid stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="x" tick={{ fontSize: 10, fill: '#6b7280' }} interval={9} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} width={36} domain={['auto', 'auto']} />
                  <Tooltip />
                  <Line type="monotone" dataKey="y" name={item.name} stroke={COLORS[index % COLORS.length]} dot={false} strokeWidth={1.6} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

export function ProgressCard({ progress }: { progress: DashboardSnapshot['progress'] }) {
  const pct = progress.total ? Math.round((progress.current / progress.total) * 1000) / 10 : 0
  return (
    <Card>
      <CardHeader title="项目进度" />
      <div className="space-y-3 p-4">
        <div className="flex items-end justify-between">
          <span className="text-sm text-gray-700">{progress.current} / {progress.total} {progress.unit}</span>
          <b className="text-sm tabular-nums">{pct}%</b>
        </div>
        <div className="h-2 rounded-full bg-gray-100" aria-hidden><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
        <p className="text-xs text-gray-500">{progress.caption}</p>
        <div className="space-y-2">
          {progress.milestones.map((item) => (
            <div key={item.label} className={item.current ? 'rounded-lg bg-indigo-50 px-3 py-2' : 'px-3 py-1'}>
              <div className="text-xs font-medium text-gray-500">{item.label}</div>
              <div className="text-sm text-gray-800">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}

export function RiskList({ risks }: { risks: RiskItem[] }) {
  return (
    <Card>
      <CardHeader title="风险与异常" extra={<AppLink to="/history" className="text-xs text-indigo-600">运行记录</AppLink>} />
      <div className="space-y-2 p-3">
        {risks.length === 0 && <EmptyState title="没有告警" body="当前项目快照里没有风险项。" />}
        {risks.map((risk) => (
          <div key={risk.id} className="rounded-lg border border-gray-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <b className="text-sm font-medium text-gray-900">{risk.title}</b>
              <SeverityText severity={risk.severity} />
            </div>
            <p className="mt-1 text-xs text-gray-500">{risk.detail}</p>
            <p className="mt-1 text-[11px] text-gray-400">{formatRelative(risk.at)}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

export function SummaryCard({ summary }: { summary: DashboardSnapshot['summary'] }) {
  return (
    <Card>
      <CardHeader title="AI 分析摘要" sub="由运行结果生成，不是设备指令" extra={<span className="text-xs text-gray-400">{formatRelative(summary.updatedAt)}</span>} />
      <div className="space-y-3 p-4">
        <p className="text-sm leading-6 text-gray-700">{summary.text}</p>
        <ul className="space-y-1.5">
          {summary.insights.map((item) => (
            <li key={item.text} className="flex items-start gap-2 text-sm text-gray-700">
              <Badge tone={item.tone === 'ok' ? 'good' : item.tone === 'warn' ? 'warn' : 'info'}>{item.tone === 'ok' ? '正常' : item.tone === 'warn' ? '关注' : '信息'}</Badge>
              {item.text}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  )
}

export function EngineeringMetrics({ rows }: { rows: DashboardSnapshot['engineeringMetrics'] }) {
  return (
    <Card>
      <CardHeader title="关键工程指标" sub="观察区间来自快照" />
      <div className="divide-y divide-gray-100">
        {rows.length === 0 && <EmptyState title="没有指标" body="接入遥测后由后端快照提供。" />}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <span className="text-gray-600">{row.label}</span>
            <span className="font-medium tabular-nums text-gray-900">{row.value}</span>
            <span className="text-xs text-gray-400">{row.range}</span>
            <Badge tone={row.inRange ? 'good' : 'warn'}>{row.inRange ? '区间内' : '越界'}</Badge>
          </div>
        ))}
      </div>
    </Card>
  )
}
