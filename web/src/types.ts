export interface Channel {
  id: number
  name: string
  slug: string
  description: string
  public: boolean
  created_at: string
}

export type StreamType = 'audio_video' | 'audio_only' | 'video_only'

export interface Source {
  id: number
  channel_id: number
  name: string
  type: 'file' | 'rtmp' | 'rtsp' | 'device' | 'hls' | 'udp' | 'rtp' | 'srt'
  url: string
  stream_type: StreamType
  metadata: string
  created_at: string
}

export interface Output {
  id: number
  source_id: number
  type: string
  path: string
  created_at: string
}

export type JobStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'

export interface Job {
  id: number
  source_id: number
  output_id: number
  status: JobStatus
  progress: number
  error_msg: string
  pid: number
  created_at: string
  ended_at: string | null
}

export interface JobLog {
  id: number
  job_id: number
  level: string
  message: string
  created_at: string
}

export interface JobUpdatePayload {
  id: number
  status?: JobStatus
  progress?: number
}

export interface JobLogPayload {
  id: number
  level: string
  message: string
}

export interface JobCompletePayload {
  id: number
  status: JobStatus
}

export interface JobErrorPayload {
  id: number
  status: JobStatus
  error: string
}

export interface JobPausedPayload {
  id: number
  status: JobStatus
  reason: string
}

export type JobEventPayload =
  | JobUpdatePayload
  | JobLogPayload
  | JobCompletePayload
  | JobErrorPayload
  | JobPausedPayload
  | ExportProgressPayload
  | ExportCompletePayload
  | ExportErrorPayload

export interface ExportProgressPayload {
  id: number
  status: string
  progress?: number
}

export interface ExportCompletePayload {
  id: number
  status: string
  file_size?: number
}

export interface ExportErrorPayload {
  id: number
  status: string
  error: string
}

export interface JobEvent {
  type: string
  payload: JobEventPayload
}

export interface TimelineEvent {
  id: number
  job_id: number
  time_offset: number
  label: string
  color: string
  created_at: string
}

export interface Export {
  id: number
  source_id: number
  output_id: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  start_time: number
  duration: number
  file_path: string
  file_size: number
  error_msg: string
  created_at: string
  completed_at: string | null
}

export type UserRole = 'admin' | 'guest'

export interface User {
  id: number
  username: string
  role: UserRole
  created_at: string
}

export interface Schedule {
  id: number
  source_id: number
  name: string
  enabled: boolean
  start_time: string
  end_time: string | null
  days_of_week: string
  current_job_id: number | null
  last_started: string | null
  created_at: string
}
