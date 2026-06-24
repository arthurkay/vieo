export interface Channel {
  id: number
  name: string
  slug: string
  description: string
  created_at: string
}

export type StreamType = 'audio_video' | 'audio_only' | 'video_only'

export interface Source {
  id: number
  channel_id: number
  type: 'file' | 'rtmp' | 'rtsp' | 'device' | 'hls'
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

export interface Job {
  id: number
  source_id: number
  output_id: number
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'stopped'
  progress: number
  error_msg: string
  pid: number
  created_at: string
  ended_at: string | null
}

export interface JobEvent {
  type: string
  payload: Record<string, unknown>
}
