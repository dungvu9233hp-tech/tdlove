'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { notifyPartner } from '@/lib/push'
import { KINDS, type Act, type ActResult, type Game, type GameChannel } from './types'

// Kênh broadcast + presence private `game-<space>` (cần phase24.sql).
// Dùng để (1) biết người kia có đang mở đúng ván này không, để khỏi gửi thông báo đẩy khi hai đứa đang chơi cùng lúc,
// (2) truyền nét vẽ cho "Vẽ và đoán".
export function useGameChannel(spaceId: string, myId: string, gameId: string): GameChannel {
  const ch = useRef<ReturnType<typeof sb.channel> | null>(null)
  const hs = useRef(new Set<(ev: string, p: any) => void>())
  const [here, setHere] = useState(false)
  useEffect(() => {
    // Tên kênh phải đúng 'game-<space id>' để khớp chính sách realtime.messages trong phase24.sql
    const c2 = sb.channel('game-' + spaceId, { config: { private: true, broadcast: { self: false }, presence: { key: myId } } })
    for (const ev of ['stroke', 'clear', 'sync_req', 'sync']) c2.on('broadcast', { event: ev }, (m: any) => {
      const p = m?.payload
      if (!p || p.gid !== gameId || p.from === myId) return
      hs.current.forEach(h => h(ev, p))
    })
    c2.on('presence', { event: 'sync' }, () => {
      const st = c2.presenceState() as Record<string, any[]>
      setHere(Object.entries(st).some(([k, arr]) => k !== myId && arr.some(p => p?.game === gameId)))
    })
    c2.subscribe(async s => { if (s === 'SUBSCRIBED') { try { await c2.track({ game: gameId }) } catch { /* không có presence thì vẫn chơi được */ } } })
    ch.current = c2
    return () => { ch.current = null; setHere(false); sb.removeChannel(c2) }
  }, [spaceId, myId, gameId])
  const send = useCallback((ev: string, payload: Record<string, unknown>) => {
    ch.current?.send({ type: 'broadcast', event: ev, payload: { ...payload, gid: gameId, from: myId } })
  }, [gameId, myId])
  const listen = useCallback((h: (ev: string, p: any) => void) => { hs.current.add(h); return () => { hs.current.delete(h) } }, [])
  return useMemo(() => ({ partnerHere: here, send, listen }), [here, send, listen])   // đối tượng ổn định để các effect không chạy lại mỗi lần render
}

// Một phòng chơi: tải ván, nghe realtime, gọi hàm máy chủ, nhắc người kia khi đến lượt họ.
export function useGame(id: string) {
  const { me, partner, space } = useApp()
  const [g, setG] = useState<Game | null | undefined>(undefined)   // undefined: đang tải, null: không thấy
  const [secret, setSecret] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const ch = useGameChannel(space.id, me.id, id)
  const ver = useRef(-1), busyRef = useRef(false), lastPush = useRef(0), chRef = useRef(ch)
  chRef.current = ch

  const loadSecret = useCallback(async () => {
    const r = await sb.rpc('game_my_secret', { p_id: id })
    if (!r.error) setSecret(r.data ?? null)
  }, [id])

  const apply = useCallback((n: Game) => {
    setG(prev => prev && prev.version > n.version ? prev : n)
    if (n.version !== ver.current) { ver.current = n.version; loadSecret() }
  }, [loadSecret])

  const refresh = useCallback(async (): Promise<Game | null> => {
    const r = await sb.from('games').select('*').eq('id', id).maybeSingle()
    if (r.error) return null                       // lỗi mạng thoáng qua: giữ nguyên màn hình hiện tại
    if (!r.data) { setG(null); return null }       // không có (đã xóa hoặc không thuộc Space của mình)
    apply(r.data as Game); return r.data as Game
  }, [id, apply])

  useEffect(() => {
    refresh()
    const c = sb.channel('game-row-' + id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${id}` }, p => apply(p.new as Game))
      .subscribe()
    const onVis = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVis)
    // Phòng hờ realtime chưa bật hoặc rớt mạng: hỏi lại mỗi 12 giây khi đang xem
    const t = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 12000)
    return () => { sb.removeChannel(c); document.removeEventListener('visibilitychange', onVis); clearInterval(t) }
  }, [id, refresh, apply])

  const act: Act = useCallback(async (fn, args = {}): Promise<ActResult> => {
    if (busyRef.current) return { ok: false }
    busyRef.current = true; setBusy(true); setMsg('')
    const r = await sb.rpc(fn, { p_id: id, ...args })
    busyRef.current = false; setBusy(false)
    if (r.error) { setMsg(r.error.message); refresh(); return { ok: false } }
    const n = await refresh()
    // Đến lượt người kia và họ không đang ở trong ván này: gửi thông báo đẩy (tối đa một lần mỗi 90 giây)
    if (n && partner && n.status === 'playing' && n.waiting.includes(partner.id) && !n.waiting.includes(me.id)
      && !chRef.current.partnerHere && Date.now() - lastPush.current > 90000) {
      lastPush.current = Date.now()
      notifyPartner('game', `${KINDS[n.kind].name}: đến lượt bạn rồi!`, id)
    } else if (n && partner && n.status === 'done' && !chRef.current.partnerHere) {
      notifyPartner('game', `${KINDS[n.kind].name}: ván đã xong, vào xem kết quả nhé!`, id)
    }
    return { ok: true, data: r.data }
  }, [id, refresh, partner, me.id])

  return { g, secret, busy, msg, setMsg, act, ch, refresh }
}
