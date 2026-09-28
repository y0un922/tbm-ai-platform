import type { DashboardSnapshot, Project } from '@/types'
import { request } from '@/api/client'

export const listProjects = () => request<Project[]>('/projects')
export const getDashboard = (projectId: string) => request<DashboardSnapshot>(`/dashboard?projectId=${projectId}`)
