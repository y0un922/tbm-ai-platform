// 会商触发器：手动 / 数据规则 / 定时任务 / 设备报警联动。
// 发起时把问题和触发来源随 POST /api/runs 提交（CreateRunRequest.question / trigger）。
// 触发器配置本身后端还没有接口，先存本地草稿；规则命中用逐环数据在前端评估，自动发起与定时执行需后端调度器。
import { SPECIALISTS, type RingPoint, type RunTrigger, type SpecialistId } from '@tbm/shared'
import { BASE_RINGS, avg } from './rings.ts'

export type TriggerKind = RunTrigger['kind']
export const KIND_LABEL: Record<TriggerKind, string> = { manual: '手动发起', rule: '数据规则', schedule: '定时任务', event: '报警联动' }

export type Metric = 'advanceSpeed' | 'torque' | 'thrust' | 'fir' | 'gravelContent'
export const METRICS: Record<Metric, { label: string; unit: string; scale: number }> = {
  advanceSpeed: { label: '推进速度', unit: 'mm/min', scale: 1 },
  torque: { label: '刀盘扭矩', unit: 'kN·m', scale: 1 },
  thrust: { label: '总推力', unit: 'kN', scale: 1 },
  fir: { label: '泡沫注入率 FIR', unit: '%', scale: 100 },
  gravelContent: { label: '卵石含量', unit: '%', scale: 100 },
}

export interface RuleCond {
  metric: Metric
  op: 'below' | 'above'
  ratio: number // 相对基线的比例，例如 0.85 = 低于基线 85%
  persist: number // 连续多少环满足才触发
}

export interface ScheduleCond {
  times: string[] // HH:MM
  cycle: 'daily' | 'weekday' | 'monday'
}

export interface Trigger {
  id: string
  name: string
  kind: TriggerKind
  enabled: boolean
  desc: string
  question: string // 会商问题模板，{ring} {metric} 会被替换
  experts: SpecialistId[]
  onFire: 'auto' | 'confirm' // 命中后自动发起 / 通知值班人员确认后发起
  rule?: RuleCond
  schedule?: ScheduleCond
  event?: { source: string; codes: string }
  planned?: boolean // 依赖的数据源尚未接入
}

const all = [...SPECIALISTS]

export const DEFAULT_TRIGGERS: Trigger[] = [
  {
    id: 'manual', name: '人工发起', kind: 'manual', enabled: true, experts: all, onFire: 'auto',
    desc: '值班工程师或项目总工在 AI 协同页手动发起，填写要会商的问题',
    question: 'TBM-01 当前掘进到 {ring} 环，请会商以下问题：',
  },
  {
    id: 'rule-speed', name: '推进速度持续下降', kind: 'rule', enabled: true, experts: all, onFire: 'confirm',
    desc: '推进速度连续多环低于基线，是效率类问题最直接的信号',
    rule: { metric: 'advanceSpeed', op: 'below', ratio: 0.85, persist: 3 },
    question: 'TBM-01 从 {ring} 环起{metric}明显下降，请会商找出原因。',
  },
  {
    id: 'rule-fir', name: '泡沫注入率偏低', kind: 'rule', enabled: true, experts: ['muck', 'boring', 'geology'], onFire: 'confirm',
    desc: '泡沫注入不足会让渣土过干，通常先于推进速度下降出现',
    rule: { metric: 'fir', op: 'below', ratio: 0.7, persist: 3 },
    question: 'TBM-01 从 {ring} 环起{metric}持续偏低，请会商原因及对掘进的影响。',
  },
  {
    id: 'rule-torque', name: '刀盘扭矩异常升高', kind: 'rule', enabled: false, experts: all, onFire: 'confirm',
    desc: '扭矩持续偏高可能是地层变化、结泥饼或渣土改良不足',
    rule: { metric: 'torque', op: 'above', ratio: 1.15, persist: 5 },
    question: 'TBM-01 从 {ring} 环起{metric}持续偏高，请会商原因。',
  },
  {
    id: 'cron-shift', name: '交接班前巡检', kind: 'schedule', enabled: true, experts: all, onFire: 'auto',
    desc: '每班交接前汇总本班掘进状态，排查尚未触发告警的潜在异常',
    schedule: { times: ['07:30', '19:30'], cycle: 'daily' },
    question: '请汇总 TBM-01 本班（截至 {ring} 环）掘进状态，排查潜在异常并给出下一班注意事项。',
  },
  {
    id: 'cron-weekly', name: '每周设备健康复盘', kind: 'schedule', enabled: false, experts: all, onFire: 'auto',
    desc: '每周一回顾上周掘进效率、刀具消耗和渣土改良效果',
    schedule: { times: ['09:00'], cycle: 'monday' },
    question: '请复盘 TBM-01 上周（截至 {ring} 环）的掘进效率、刀具消耗与渣土改良效果。',
  },
  {
    id: 'event-alarm', name: '设备报警联动', kind: 'event', enabled: false, experts: all, onFire: 'confirm', planned: true,
    desc: 'PLC / 报警系统出现指定报警码时发起会商。依赖报警 MCP，尚未接入',
    event: { source: '设备报警 MCP（待接入）', codes: 'FOAM_FLOW_LOW, CUTTER_TORQUE_HIGH' },
    question: 'TBM-01 在 {ring} 环报警，请会商报警原因与影响。',
  },
]

export interface RuleHit {
  start: number // 开始满足条件的环
  fired: number // 连续满足 persist 环、真正触发的环
  base: number
  threshold: number
  current: number
}

/** 第一个连续 persist 环满足条件的窗口 */
export function evaluateRule(rings: RingPoint[], c: RuleCond): RuleHit | undefined {
  if (!rings.length) return undefined
  const base = avg(rings.slice(0, BASE_RINGS).map((r) => r[c.metric]))
  const threshold = base * c.ratio
  const ok = (r: RingPoint) => (c.op === 'below' ? r[c.metric] < threshold : r[c.metric] > threshold)
  for (let i = BASE_RINGS; i + c.persist <= rings.length; i++) {
    if (rings.slice(i, i + c.persist).every(ok)) {
      return { start: rings[i].ring, fired: rings[i + c.persist - 1].ring, base, threshold, current: rings.at(-1)![c.metric] }
    }
  }
  return undefined
}

const CYCLE_LABEL = { daily: '每天', weekday: '工作日', monday: '每周一' }

export function describe(t: Trigger): string {
  if (t.rule) {
    const m = METRICS[t.rule.metric]
    return `${m.label}连续 ${t.rule.persist} 环${t.rule.op === 'below' ? '低于' : '高于'}基线 ${Math.round(t.rule.ratio * 100)}%`
  }
  if (t.schedule) return `${CYCLE_LABEL[t.schedule.cycle]} ${t.schedule.times.join('、')}`
  if (t.event) return `${t.event.source}：${t.event.codes}`
  return '用户在 AI 协同页点击「开始会商」'
}

/** 接下来 n 次定时执行时间 */
export function nextRuns(s: ScheduleCond, from = new Date(), n = 1): Date[] {
  const out: Date[] = []
  const day = new Date(from)
  day.setHours(0, 0, 0, 0)
  for (let d = 0; d < 14 && out.length < n; d++) {
    const wd = day.getDay()
    const okDay = s.cycle === 'daily' || (s.cycle === 'weekday' && wd >= 1 && wd <= 5) || (s.cycle === 'monday' && wd === 1)
    if (okDay) {
      for (const t of [...s.times].sort()) {
        const [h, m] = t.split(':').map(Number)
        const at = new Date(day)
        at.setHours(h, m)
        if (at > from && out.length < n) out.push(at)
      }
    }
    day.setDate(day.getDate() + 1)
  }
  return out
}

export function fillQuestion(t: Trigger, ring: number) {
  return t.question.replace('{ring}', String(ring)).replace('{metric}', t.rule ? METRICS[t.rule.metric].label : '')
}

/** 人工发起时输入框的默认问题，与后端场景默认问题一致 */
export const DEFAULT_QUESTION = 'TBM-01 当前掘进到 540 环。从 521 环起推进速度明显下降，请会商找出原因。'

const DRAFT_KEY = 'tbm.triggers.draft'
export function loadTriggers(): Trigger[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) return JSON.parse(raw) as Trigger[]
  } catch { /* 草稿损坏时回到默认 */ }
  return DEFAULT_TRIGGERS
}
export const saveTriggers = (ts: Trigger[]) => localStorage.setItem(DRAFT_KEY, JSON.stringify(ts))
export const resetTriggers = () => localStorage.removeItem(DRAFT_KEY)
