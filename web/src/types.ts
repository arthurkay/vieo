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

// Local V4L2 capture device discovered on the backend host.
export interface V4L2Device {
  path: string
  card: string
  driver: string
  bus_info: string
  resolutions: string[]
  default_resolution: string
}

// IP camera discovered via ONVIF WS-Discovery.
export interface ONVIFCamera {
  endpoint: string
  host: string
  port: number
  manufacturer: string
  model: string
  firmware: string
  serial: string
  stream_uri: string
  username: string
}

// Runtime health status of a registered camera-type source.
export interface CameraStatus {
  id: number
  name: string
  type: string
  url: string
  status: 'online' | 'recording' | 'offline' | 'error'
  last_seen?: string
  job_status?: string
  job_id?: number
  output_id?: number
}

export interface DiscoveryResponse {
  cameras: ONVIFCamera[]
  count: number
}

export interface CameraStatusResponse {
  cameras: CameraStatus[]
  count: number
}

export interface M3UChannel {
  name: string
  url: string
  tvg_id: string
  resolution: string
  geo_blocked: boolean
}

export interface M3UChannelResponse {
  channels: M3UChannel[]
  count: number
}
