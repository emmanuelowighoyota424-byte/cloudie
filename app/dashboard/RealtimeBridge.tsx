'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const STORAGE_KEY = 'cloudie-realtime-cursor'
const WORKSPACE_KEY = 'cloudie-workspace-id'

export default function RealtimeBridge() {
  const router = useRouter()
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  useEffect(() => {
    const read = () => setWorkspaceId(localStorage.getItem(WORKSPACE_KEY))
    read()
    window.addEventListener('cloudie:workspace', read)
    return () => window.removeEventListener('cloudie:workspace', read)
  }, [])

  useEffect(() => {
    let stopped = false
    let ws: WebSocket | null = null
    let retry = 500
    let timer: ReturnType<typeof setTimeout> | null = null
    const connect = async () => {
      try {
        const response = await fetch('/api/realtime/ticket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workspaceId }) })
        if (!response.ok) throw new Error('realtime ticket unavailable')
        const { ticket } = await response.json() as { ticket: string }
        const base = process.env.NEXT_PUBLIC_REALTIME_URL
        if (!base) return
        const url = new URL('/ws', base)
        url.searchParams.set('ticket', ticket)
        ws = new WebSocket(url.toString())
        ws.onopen = () => {
          retry = 500
          ws?.send(JSON.stringify({ type: 'subscribe', workspaceId, since: Number(localStorage.getItem(STORAGE_KEY) || 0) }))
        }
        ws.onmessage = (event) => {
          try {
            const value = JSON.parse(event.data) as { type?: string; id?: string; eventType?: string }
            if (value.type !== 'event') return
            if (value.id) localStorage.setItem(STORAGE_KEY, value.id)
            window.dispatchEvent(new CustomEvent('cloudie:realtime', { detail: value }))
            if (value.eventType) router.refresh()
          } catch { /* ignore malformed frames */ }
        }
        ws.onclose = () => {
          if (stopped) return
          timer = setTimeout(() => void connect(), retry)
          retry = Math.min(retry * 2, 15000)
        }
      } catch {
        if (!stopped) {
          timer = setTimeout(() => void connect(), retry)
          retry = Math.min(retry * 2, 15000)
        }
      }
    }
    void connect()
    return () => { stopped = true; if (timer) clearTimeout(timer); ws?.close() }
  }, [router, workspaceId])
  return null
}
