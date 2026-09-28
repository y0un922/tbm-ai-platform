import type { AgentRecord } from '@/types'
import { request } from '@/api/client'

export const listAgents = () => request<AgentRecord[]>('/agents')
export const updateAgent = (id: string, body: Partial<AgentRecord>) => request<AgentRecord>(`/agents/${id}`, { method: 'PATCH', body })
