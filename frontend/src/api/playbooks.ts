import type { Playbook, Run } from '@/types'
import { request } from '@/api/client'

export const listPlaybooks = (projectId: string) => request<Playbook[]>(`/playbooks?projectId=${projectId}`)
export const createPlaybook = (body: Omit<Playbook, 'id' | 'version' | 'updatedAt'>) => request<Playbook>('/playbooks', { method: 'POST', body })
export const testPlaybook = (id: string) => request<Run>(`/playbooks/${id}/test`, { method: 'POST' })
export const updatePlaybook = (id: string, body: Partial<Playbook>) => request<Playbook>(`/playbooks/${id}`, { method: 'PATCH', body })
