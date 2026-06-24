import type { Channel, Source, Output, Job } from '@/types'

const BASE = '/api'

interface HealthResponse {
  status: string
  version: string
  jobs: Record<string, number>
  disk?: {
    usage_percent: number
    total_gb: number
    free_gb: number
    warn: number
    crit: number
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  channels: {
    list: () => request<Channel[]>('/channels'),
    get: (id: number) => request<Channel>(`/channels/${id}`),
    create: (data: Partial<Channel>) =>
      request<Channel>('/channels', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Channel>) =>
      request<Channel>(`/channels/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/channels/${id}`, { method: 'DELETE' }),
  },

  sources: {
    list: (channelId?: number) =>
      request<Source[]>(`/sources${channelId ? `?channel_id=${channelId}` : ''}`),
    get: (id: number) => request<Source>(`/sources/${id}`),
    create: (data: Partial<Source>) =>
      request<Source>('/sources', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/sources/${id}`, { method: 'DELETE' }),
  },

  outputs: {
    list: () => request<Output[]>('/outputs'),
    create: (data: Partial<Output>) =>
      request<Output>('/outputs', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/outputs/${id}`, { method: 'DELETE' }),
  },

  jobs: {
    list: (status?: string) =>
      request<Job[]>(`/jobs${status ? `?status=${status}` : ''}`),
    create: (sourceId: number, outputId: number) =>
      request<Job>('/jobs', {
        method: 'POST',
        body: JSON.stringify({ source_id: sourceId, output_id: outputId }),
      }),
    stop: (id: number) =>
      request<void>(`/jobs/${id}/stop`, { method: 'POST' }),
    pause: (id: number) =>
      request<void>(`/jobs/${id}/pause`, { method: 'POST' }),
    resume: (id: number) =>
      request<void>(`/jobs/${id}/resume`, { method: 'POST' }),
    retry: (id: number) =>
      request<void>(`/jobs/${id}/retry`, { method: 'POST' }),
    delete: (id: number) =>
      request<void>(`/jobs/${id}`, { method: 'DELETE' }),
  },
}
