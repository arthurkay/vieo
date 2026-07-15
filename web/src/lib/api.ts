import type { Channel, Source, Output, Job, JobLog, User, Schedule, Export, TimelineEvent, V4L2Device, DiscoveryResponse, CameraStatusResponse } from '@/types'

const BASE = '/api'

interface HealthResponse {
  status: string
  version: string
  jobs: Record<string, number>
  watermark: boolean
  disk?: {
    usage_percent: number
    total_gb: number
    free_gb: number
    warn: number
    crit: number
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const hasBody = options?.body !== undefined
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    ...(hasBody ? { headers: { 'Content-Type': 'application/json' } } : {}),
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

  auth: {
    login: (username: string, password: string) =>
      request<User>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request<void>('/auth/logout', { method: 'POST' }),
    me: () => request<User>('/auth/me'),
    users: {
      list: () => request<User[]>('/auth/users'),
      create: (data: { username: string; password: string; role: string }) =>
        request<User>('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
      resetPassword: (id: number, password: string) =>
        request<void>(`/auth/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) }),
      delete: (id: number) =>
        request<void>(`/auth/users/${id}`, { method: 'DELETE' }),
    },
  },

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
    update: (id: number, data: Partial<Source>) =>
      request<Source>(`/sources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/sources/${id}`, { method: 'DELETE' }),
  },

  outputs: {
    list: () => request<Output[]>('/outputs'),
    create: (data: Partial<Output>) =>
      request<Output>('/outputs', { method: 'POST', body: JSON.stringify(data) }),
    storage: (id: number) => request<{ bytes: number; duration: number }>(`/outputs/${id}/storage`),
    download: (id: number) =>
      request<Export>(`/outputs/${id}/download`, { method: 'POST' }),
    delete: (id: number) =>
      request<void>(`/outputs/${id}`, { method: 'DELETE' }),
  },

  jobs: {
    list: (status?: string, sourceId?: number) => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      if (sourceId) params.set('source_id', String(sourceId))
      const qs = params.toString()
      return request<Job[]>(`/jobs${qs ? `?${qs}` : ''}`)
    },
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
    continue: (id: number) =>
      request<void>(`/jobs/${id}/continue`, { method: 'POST' }),
    delete: (id: number) =>
      request<void>(`/jobs/${id}`, { method: 'DELETE' }),
    logs: (id: number) =>
      request<JobLog[]>(`/jobs/${id}/logs`),
  },

  schedules: {
    list: (sourceId?: number) => {
      const params = new URLSearchParams()
      if (sourceId) params.set('source_id', String(sourceId))
      const qs = params.toString()
      return request<Schedule[]>(`/schedules${qs ? `?${qs}` : ''}`)
    },
    get: (id: number) => request<Schedule>(`/schedules/${id}`),
    create: (data: Partial<Schedule>) =>
      request<Schedule>('/schedules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Schedule>) =>
      request<Schedule>(`/schedules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/schedules/${id}`, { method: 'DELETE' }),
  },

  exports: {
    list: () => request<Export[]>('/exports'),
    get: (id: number) => request<Export>(`/exports/${id}`),
    create: (data: { source_id: number; output_id: number; start_time: number; duration: number }) =>
      request<Export>('/exports', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/exports/${id}`, { method: 'DELETE' }),
    downloadUrl: (id: number) => `/api/exports/${id}/download`,
  },

  events: {
    listByJob: (jobId: number) => request<TimelineEvent[]>(`/jobs/${jobId}/events`),
    create: (jobId: number, data: { time_offset: number; label: string; color?: string }) =>
      request<TimelineEvent>(`/jobs/${jobId}/events`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: { time_offset: number; label: string; color: string }) =>
      request<TimelineEvent>(`/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: number) =>
      request<void>(`/events/${id}`, { method: 'DELETE' }),
  },

  devices: {
    list: async () => {
      const res = await request<{ devices: V4L2Device[] }>('/devices')
      return res.devices ?? []
    },
  },

  cameras: {
    discover: (timeout?: number, username?: string, password?: string) =>
      request<DiscoveryResponse>('/cameras/discover', {
        method: 'POST',
        body: JSON.stringify({ timeout, username, password }),
      }),
    status: () =>
      request<CameraStatusResponse>('/cameras/status'),
    snapshotUrl: (id: number) => `/api/cameras/${id}/snapshot`,
  },
}
