import type { Run, TriggerDefinition, TriggerInstance } from '@/types'
import { request } from '@/api/client'

export const listTriggers = (projectId: string) => request<TriggerDefinition[]>(`/triggers?projectId=${projectId}`)
export const listTriggerInstances = (projectId: string) => request<TriggerInstance[]>(`/trigger-instances?projectId=${projectId}`)
export const createTrigger = (body: TriggerDefinition) => request<TriggerDefinition>('/triggers', { method: 'POST', body })
export const patchTrigger = (id: string, body: Partial<TriggerDefinition>) => request<TriggerDefinition>(`/triggers/${id}`, { method: 'PATCH', body })
export const testTrigger = (id: string) => request<Run>(`/triggers/${id}/test`, { method: 'POST', body: {} })
