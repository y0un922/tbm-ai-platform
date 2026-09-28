export interface RingRow {
  ring: number
  fir: number
  penetrationMmPerRev: number
  thrustKn: number
  torqueKnm: number
  screwCurrentA: number
  advanceMmMin: number
  cutterRpm: number
  foamBar: number
  foamFluctuation: 'ok' | 'out_of_band'
  muckFlow: 'ok' | 'poor'
  muckMoisture: number
  geology: string
}

export type SceneKind = 'fir' | 'foam' | 'cutter' | 'geology'

function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

function rng(seed: number) {
  let s = seed || 1
  return () => {
    s = Math.imul(s ^ (s >>> 15), 0x45d9f3b)
    s = Math.imul(s ^ (s >>> 15), 0x45d9f3b) ^ (s >>> 16)
    return ((s >>> 0) % 10000) / 10000
  }
}

function jitter(rand: () => number, n: number, pct: number) {
  return Math.round(n * (1 + (rand() * 2 - 1) * pct) * 100) / 100
}

const GEO = ['粉质黏土', '粉质黏土趋近砂泥岩交界', '砂层与泥岩交界', '砂层与泥岩交界，含水率偏高', '中风化泥岩']

function build(kind: SceneKind, seed: number): RingRow[] {
  const rand = rng(seed)
  const rows: RingRow[] = []
  for (let i = 0; i < 7; i++) {
    const ring = 1246 + i
    const t = i / 6
    const firBase = kind === 'fir' ? 0.42 - t * 0.13 : kind === 'foam' ? 0.38 - t * 0.04 : 0.4 - t * 0.03
    const torqueBase = kind === 'cutter' ? 2100 + t * 900 : 2100 + t * 400
    const foamBase = kind === 'foam' ? 2.7 + t * 0.7 : 2.8 + t * 0.2
    const muckPoor = kind === 'foam' || kind === 'fir' ? i >= 2 : false
    const geo = kind === 'geology' || kind === 'fir' ? GEO[Math.min(i, GEO.length - 1)] : GEO[0]
    rows.push({
      ring,
      fir: Math.max(0.18, jitter(rand, firBase, 0.06)),
      penetrationMmPerRev: jitter(rand, 8.2 - t * 2.8, 0.08),
      thrustKn: Math.round(jitter(rand, 18000 + t * 3500, 0.04)),
      torqueKnm: Math.round(jitter(rand, torqueBase, 0.05)),
      screwCurrentA: Math.round(jitter(rand, 170 + t * 60, 0.06)),
      advanceMmMin: Math.round(jitter(rand, 52 - t * 10, 0.05)),
      cutterRpm: 1.8,
      foamBar: jitter(rand, foamBase, 0.05),
      foamFluctuation: kind === 'foam' && i >= 3 ? 'out_of_band' : foamBase > 3.05 && i >= 4 ? 'out_of_band' : 'ok',
      muckFlow: muckPoor ? 'poor' : 'ok',
      muckMoisture: jitter(rand, 0.18 + (muckPoor ? t * 0.12 : t * 0.03), 0.1),
      geology: geo,
    })
  }
  return rows
}

const scenes = new Map<string, { kind: SceneKind; rows: RingRow[] }>()
let active = 'default'

export function bindScene(runId: string, preset?: SceneKind | 'random') {
  const seed = hash(runId)
  const kind: SceneKind = preset === 'fir' || preset === 'foam' || preset === 'cutter' || preset === 'geology'
    ? preset
    : (['fir', 'foam', 'cutter', 'geology'] as const)[seed % 4]
  scenes.set(runId, { kind, rows: build(kind, seed) })
  active = runId
  return kind
}

function rowsOf(runId?: string) {
  return scenes.get(runId ?? active)?.rows ?? scenes.get(active)?.rows ?? build('fir', 1)
}

export function rings(from = 1246, to = 1250, runId?: string) {
  return rowsOf(runId).filter((row) => row.ring >= from && row.ring <= to)
}

export function ring(n: number, runId?: string) {
  return rowsOf(runId).find((row) => row.ring === n)
}

export function firDropPct(from = 1246, to = 1250, runId?: string) {
  const a = ring(from, runId)?.fir
  const b = ring(to, runId)?.fir
  if (!a || !b) return 0
  return Math.round((1 - b / a) * 1000) / 10
}

export function sceneKind(runId?: string) {
  return scenes.get(runId ?? active)?.kind
}

bindScene('default', 'fir')
