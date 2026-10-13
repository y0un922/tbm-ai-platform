import type { ChartSpec } from '@tbm/shared'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const PALETTE = ['#136ff3', '#ea8a0c', '#7c3aed', '#10b981', '#ef4444']

/** 渲染工具结果 / 证据里的 ChartSpec。compact 用于抽屉里的迷你图 */
export function ChartView({ spec, compact = false }: { spec: ChartSpec; compact?: boolean }) {
  const common = (
    <>
      {!compact && <CartesianGrid stroke="#e4eaf2" strokeDasharray="3 3" />}
      <XAxis dataKey={spec.x.key} stroke="#6d7d97" fontSize={11} hide={compact} />
      <YAxis stroke="#6d7d97" fontSize={11} hide={compact} width={40} />
      {!compact && <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e4eaf2', borderRadius: 8 }} />}
      {!compact && spec.series.length > 1 && <Legend />}
      {spec.markers?.map((m) => (
        <ReferenceLine key={m.x} x={m.x} stroke="#ef4444" strokeDasharray="4 2" label={compact ? undefined : { value: m.label, fill: '#ef4444', fontSize: 11 }} />
      ))}
    </>
  )
  return (
    <ResponsiveContainer width="100%" height={compact ? 60 : 260}>
      {spec.type === 'bar' ? (
        <BarChart data={spec.rows}>
          {common}
          {spec.series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={PALETTE[i % PALETTE.length]} />)}
        </BarChart>
      ) : (
        <LineChart data={spec.rows}>
          {common}
          {spec.series.map((s, i) => (
            <Line key={s.key} dataKey={s.key} name={s.label} type={spec.type === 'step' ? 'stepAfter' : 'monotone'} stroke={PALETTE[i % PALETTE.length]} dot={false} strokeWidth={compact ? 1.5 : 2} isAnimationActive={false} />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
