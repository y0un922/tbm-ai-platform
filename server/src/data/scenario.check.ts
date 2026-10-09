// 场景数据自洽校验，见设计文档 5.6 节。运行：npm run check:data
import assert from 'node:assert/strict'
import { AREA_M2, CUTTER_RPM, ERECTION_MIN, FAULTS, FER, RING_FROM, RING_TO, RING_WIDTH_MM, RINGS, WEAR_ALARM_MM } from './scenario.ts'

const close = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= Math.abs(b) * tol
let checks = 0
const ok = (cond: boolean, msg: string) => {
  assert.ok(cond, msg)
  checks++
}

// 1 公式
for (const r of RINGS) {
  ok(close(r.penetration, r.advanceSpeed / CUTTER_RPM), `${r.ring} 贯入度`)
  ok(close(r.miningMinutes, RING_WIDTH_MM / r.advanceSpeed), `${r.ring} 单环时间`)
  ok(close(r.excavationRate, (AREA_M2 * r.advanceSpeed) / 1000), `${r.ring} 出土量`)
  ok(close(r.fir, (r.foamSolutionFlow * FER) / 1000 / r.excavationRate), `${r.ring} FIR`)
}

// 2 时间戳
for (let i = 0; i < RINGS.length; i++) {
  const r = RINGS[i]!
  ok(r.endTs > r.startTs, `${r.ring} 结束晚于开始`)
  ok(Math.abs(r.endTs - r.startTs - r.miningMinutes * 60_000) < 60_000, `${r.ring} 掘进时长`)
  if (i > 0) ok(Math.abs(r.startTs - RINGS[i - 1]!.endTs - ERECTION_MIN * 60_000) < 1000, `${r.ring} 拼装间隔`)
}

// 3 环号连续，只有坍落度按 S4 缺失
ok(RINGS.length === RING_TO - RING_FROM + 1, '环数')
RINGS.forEach((r, i) => ok(r.ring === RING_FROM + i, `环号连续 ${r.ring}`))
ok(
  RINGS.filter((r) => r.slump != null).map((r) => r.ring).join() === FAULTS.labSampledRings.join(),
  '坍落度只在取样环存在',
)

// 4 关键先后关系
const firstRing = (pred: (i: number) => boolean) => RINGS.find((_, i) => i > 0 && pred(i))!.ring
const pumpDrop = firstRing((i) => RINGS[i]!.foamSolutionFlow < RINGS[i - 1]!.foamSolutionFlow * 0.7)
const speedDrop = firstRing((i) => RINGS[i]!.advanceSpeed < RINGS[i - 1]!.advanceSpeed * 0.9)
const strataChange = RINGS.find((r) => r.gravelContent > 0)!.ring
ok(pumpDrop === FAULTS.pumpFailRing, `泵流量骤降环 ${pumpDrop}`)
ok(speedDrop === FAULTS.boringImpactRing, `速度第一次下降环 ${speedDrop}`)
ok(strataChange === FAULTS.strataChangeRing, `地层变化环 ${strataChange}`)
ok(pumpDrop < speedDrop && speedDrop < strataChange, '518 < 521 < 525')

// 5 刀具磨损均低于阈值
ok(RINGS.every((r) => r.wearRate < WEAR_ALARM_MM), '磨损速率低于阈值')

// 6 参考答案的每条结论都有数据支撑
const avg = (rows: typeof RINGS, f: (r: (typeof RINGS)[number]) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length
const seg = (a: number, b: number) => RINGS.filter((r) => r.ring >= a && r.ring <= b)
ok(avg(seg(518, 540), (r) => r.fir) < avg(seg(500, 517), (r) => r.fir) * 0.65, '主因：FIR 明显下降')
ok(FAULTS.labSampledRings.every((n) => RINGS.find((r) => r.ring === n)!.slump! < 150), '主因：渣土偏干')
ok(avg(seg(525, 540), (r) => r.advanceSpeed) < avg(seg(521, 524), (r) => r.advanceSpeed) * 0.92, '次因：525 起速度再降')
ok(seg(525, 540).every((r) => r.gravelContent >= 0.1), '次因：卵石地层')
ok(avg(seg(521, 540), (r) => r.torque) > avg(seg(500, 517), (r) => r.torque) * 1.15, '干扰项：扭矩上升')
ok(RINGS.every((r) => r.cutterTemp < 60), '排除：刀具温度正常')

console.log(`check:data 通过，${checks} 项`)
