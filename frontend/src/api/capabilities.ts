import type { Capability } from '@/types'
import { request } from '@/api/client'

export const listCapabilities = () => request<Capability[]>('/capabilities')
