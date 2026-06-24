import { useEffect, useRef, useCallback } from 'react'
import type { JobEvent } from '../types'

type EventHandler = (event: JobEvent) => void

export function useWebSocket(onEvent: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/ws`
    const ws = new WebSocket(url)

    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data) as JobEvent
        onEventRef.current(event)
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()
    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  return wsRef
}
