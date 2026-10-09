// 掘进效率异常场景数据。所有数值由下面的常量、故障设定和公式推出，见设计文档第 5 节。

export const RING_FROM = 500
export const RING_TO = 540
export const DIAMETER_M = 6.28
export const AREA_M2 = Math.PI * (DIAMETER_M / 2) ** 2
export const RING_WIDTH_MM = 1500
export const CUTTER_RPM = 1.5
export const FER = 10
export const ERECTION_MIN = 40
export const WEAR_ALARM_MM = 0.08
export const START_TS = Date.parse('2026-09-20T08:00:00+08:00')

// 故障设定 S1–S4
export const FAULTS = {
  pumpFailRing: 518, // S1 泡沫泵故障
  boringImpactRing: 521, // S2 渣土置换滞后，掘进受影响
  strataChangeRing: 525, // S3 进入含砂卵石层
  labSampledRings: [519, 526, 533], // S4 渣土实验室仅这几环取样
} as const

export interface RingRow {
  ring: number
  startTs: number
  endTs: number
  advanceSpeed: number // mm/min
  penetration: number // mm/r
  cutterRpm: number
  miningMinutes: number
  excavationRate: number // m³/min
  torque: number // kN·m
  thrust: number // kN
  foamSolutionFlow: number // L/min
  fer: number
  fir: number // 0–1
  slump: number | null // mm，未取样为 null
  stratum: string
  gravelContent: number // 0–1
  wearRate: number // mm/环
  cutterTemp: number // °C
}

// 确定性伪随机，保证每次生成结果一致
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const round = (x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d

function baseSpeed(ring: number) {
  if (ring < FAULTS.boringImpactRing) return 52
  if (ring < FAULTS.strataChangeRing) return 40
  return 34
}

// 扭矩、推力的增幅：518 起随渣土变干逐步上升，524 环到 +20% / +15%
const TORQUE_STEPS: Record<number, number> = { 518: 3200, 519: 3300, 520: 3400, 521: 3600, 522: 3700, 523: 3800 }
function baseTorque(ring: number) {
  if (ring < FAULTS.pumpFailRing) return 3200
  return TORQUE_STEPS[ring] ?? 3840
}
function baseThrust(ring: number) {
  return 16000 * (1 + ((baseTorque(ring) - 3200) / 640) * 0.15)
}

const SLUMP: Record<number, number> = { 519: 95, 526: 75, 533: 80 }

function strata(ring: number) {
  if (ring < FAULTS.strataChangeRing) return { stratum: '粉质黏土', gravelContent: 0 }
  const gravelContent = 0.1 + ((ring - FAULTS.strataChangeRing) / (RING_TO - FAULTS.strataChangeRing)) * 0.25
  return { stratum: ring < 533 ? '粉质黏土夹卵石' : '含砂卵石', gravelContent }
}

export function generateRings(seed = 20260920): RingRow[] {
  const rand = rng(seed)
  const jitter = (pct: number) => 1 + (rand() * 2 - 1) * pct
  const rows: RingRow[] = []
  let ts = START_TS
  for (let ring = RING_FROM; ring <= RING_TO; ring++) {
    const advanceSpeed = round(baseSpeed(ring) * jitter(0.015), 1)
    const penetration = advanceSpeed / CUTTER_RPM
    const miningMinutes = RING_WIDTH_MM / advanceSpeed
    const excavationRate = (AREA_M2 * advanceSpeed) / 1000
    const foamSolutionFlow = round((ring < FAULTS.pumpFailRing ? 64 : 25) * jitter(0.02), 1)
    const fir = (foamSolutionFlow * FER) / 1000 / excavationRate
    const { stratum, gravelContent } = strata(ring)
    const startTs = ts
    const endTs = startTs + miningMinutes * 60_000
    ts = endTs + ERECTION_MIN * 60_000
    rows.push({
      ring,
      startTs,
      endTs: Math.round(endTs),
      advanceSpeed,
      penetration: round(penetration, 1),
      cutterRpm: CUTTER_RPM,
      miningMinutes: round(miningMinutes, 1),
      excavationRate: round(excavationRate, 3),
      torque: Math.round(baseTorque(ring) * jitter(0.02)),
      thrust: Math.round(baseThrust(ring) * jitter(0.02)),
      foamSolutionFlow,
      fer: FER,
      fir: round(fir, 3),
      slump: SLUMP[ring] ?? null,
      stratum,
      gravelContent: round(gravelContent, 2),
      wearRate: ring < FAULTS.strataChangeRing ? 0.02 : 0.03,
      cutterTemp: round(48 * jitter(0.04), 1),
    })
  }
  return rows
}

export const RINGS = generateRings()

export function ringRange(from: number, to: number) {
  const lo = Math.max(RING_FROM, Math.min(from, to))
  const hi = Math.min(RING_TO, Math.max(from, to))
  return RINGS.filter((r) => r.ring >= lo && r.ring <= hi)
}
