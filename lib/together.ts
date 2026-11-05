'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'

// Kênh broadcast private `together-<space id>` cho "Xem cùng nhau" (cần phase14.sql để hai người trong Space đọc/ghi được).
// Sự kiện:
//  invite  rủ xem cùng một clip          join   vào phòng xem clip (bên kia trả lời bằng state)
//  state   {playing, time} phát/tạm dừng/tua   ping   còn ở trong phòng (8 giây một lần)
//  fly     {emoji} thả cảm xúc bay lên    leave  rời phòng
export type TgEvent = 'invite' | 'join' | 'state' | 'ping' | 'fly' | 'leave'
export type TgPayload = { from: string; clip?: string; playing?: boolean; time?: number; emoji?: string }
export type TgHandler = (ev: TgEvent, p: TgPayload) => void
const EVENTS: TgEvent[] = ['invite', 'join', 'state', 'ping', 'fly', 'leave']

// `send` và `listen` luôn là cùng một hàm giữa các lần render nên đưa thẳng vào mảng phụ thuộc của useEffect được.
export function useTogether(spaceId: string, myId: string) {
  const ch = useRef<ReturnType<typeof sb.channel> | null>(null)
  const hs = useRef(new Set<TgHandler>())
  const [on, setOn] = useState(false)   // đã nối được kênh chưa

  useEffect(() => {
    const c = sb.channel('together-' + spaceId, { config: { private: true, broadcast: { self: false } } })
    for (const ev of EVENTS) c.on('broadcast', { event: ev }, (m: any) => {
      const p = m?.payload as TgPayload | undefined
      if (!p || p.from === myId) return
      hs.current.forEach(h => h(ev, p))
    })
    c.subscribe(s => setOn(s === 'SUBSCRIBED'))
    ch.current = c
    return () => { ch.current = null; setOn(false); sb.removeChannel(c) }
  }, [spaceId, myId])

  const send = useCallback((ev: TgEvent, p: Omit<TgPayload, 'from'> = {}) => {
    ch.current?.send({ type: 'broadcast', event: ev, payload: { from: myId, ...p } })
  }, [myId])
  const listen = useCallback((h: TgHandler) => { hs.current.add(h); return () => { hs.current.delete(h) } }, [])
  return { on, send, listen }
}
export type Together = ReturnType<typeof useTogether>
