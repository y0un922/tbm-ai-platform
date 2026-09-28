import type { RuntimeEvent } from '@/types'
import { subscribeRun } from '@/mocks/engine'
import { mockRequest } from '@/mocks/router'

const LIVE = import.meta.env.VITE_API_MODE === 'live'
export const isMockMode = !LIVE
const BASE = import.meta.env.VITE_API_BASE ?? '/api'

export async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!LIVE) return mockRequest<T>(path, init)
  const res = await fetch(`${BASE}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body == null ? undefined : { 'content-type': 'application/json' },
    body: init?.body == null ? undefined : JSON.stringify(init.body),
  })
  if (!res.ok) throw new Error((await res.text()) || `请求失败 ${res.status}`)
  return res.json() as Promise<T>
}

/** 运行事件以服务端推送为主。实时干预再升级 WebSocket。 */
export function subscribe(path: string, onEvent: (event: RuntimeEvent) => void, onError?: (error: Error) => void) {
  if (!LIVE) {
    const runId = path.split('/')[2]
    if (!runId) {
      onError?.(new Error('缺少 runId'))
      return () => {}
    }
    return subscribeRun(runId, onEvent)
  }
  const es = new EventSource(`${BASE}${path}`)
  es.onmessage = (msg) => onEvent(JSON.parse(msg.data) as RuntimeEvent)
  es.onerror = () => onError?.(new Error('事件流中断'))
  return () => es.close()
}
