// 逐环数据的基线与持续性判断，总览告警和触发规则共用
import type { RingPoint } from '@tbm/shared'

export const BASE_RINGS = 10 // 前 10 环作为正常基线

export const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1)

/** 第一个之后持续满足条件的环（避免单环抖动误报） */
export function onset(rings: RingPoint[], test: (r: RingPoint) => boolean) {
  const i = rings.findIndex((_, k) => rings.slice(k).every(test))
  return i >= 0 ? rings[i] : undefined
}
