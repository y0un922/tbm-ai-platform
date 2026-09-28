import type { PlatformSettings } from '@/types'
import { request } from '@/api/client'

export const getSettings = () => request<PlatformSettings>('/settings')
export const updateSettings = (body: PlatformSettings) => request<PlatformSettings>('/settings', { method: 'PATCH', body })
