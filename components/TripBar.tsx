'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { MAX_POINTS, STALE_MS, TRIP_CHANGED, TRIP_STOP, accept, fmtDur, fmtKm, uid, type Fix, type Pt } from '@/lib/trip'

const qk = (id: string) => `tdlove.trip.q.${id}`, sk = (id: string) => `tdlove.trip.st.${id}`
export const AWAKE_KEY = 'tdlove.trip.awake'
type St = { dist: number; count: number; last: Fix | null }
const rd = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? d } catch { return d } }
const wr = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { } }

// Chạy ở mọi màn hình của app (MAP-07): giữ việc ghi điểm khi bạn chuyển sang tab khác, và luôn hiện thanh báo rõ ràng khi đang ghi.
// Điểm đi vào hàng đợi (lưu cả ở localStorage), cứ ~20 giây gửi một lần; mất mạng thì giữ lại gửi sau.
export default function TripBar() {
  const { me } = useApp()
  const [trip, setTrip] = useState<any>(null)
  const [, tick] = useState(0)
  const [note, setNote] = useState(''); const [gps, setGps] = useState(''); const [busy, setBusy] = useState(false)
  const q = useRef<Pt[]>([]), st = useRef<St>({ dist: 0, count: 0, last: null }), flushing = useRef(false), tripRef = useRef<any>(null)
  const wake = useRef<any>(null)
  tripRef.current = trip

  const changed = () => window.dispatchEvent(new Event(TRIP_CHANGED))
  // Gửi các điểm đang chờ lên Supabase. id do app sinh nên gửi lại không bị trùng điểm.
  const flush = useCallback(async (): Promise<boolean> => {
    const t = tripRef.current; if (!t) return true
    if (flushing.current) return false
    flushing.current = true
    try {
      if (q.current.length) {
        const batch = q.current.slice(0, 300)
        const { error } = await sb.from('location_history').upsert(batch, { onConflict: 'id', ignoreDuplicates: true })
        if (error) { if (error.code === '23503') { q.current = []; wr(qk(t.id), []) } return false }   // hành trình đã bị xóa: bỏ hàng đợi
        q.current = q.current.slice(batch.length); wr(qk(t.id), q.current)
      }
      const s = st.current   // last_at = lần cuối app còn đang ghi (không phải lúc có điểm cuối), để đứng yên ở quán lâu không bị coi là bỏ quên
      const { error } = await sb.from('trips').update({ distance_m: Math.round(s.dist), point_count: s.count, last_at: new Date().toISOString() }).eq('id', t.id)
      if (!error) { changed(); if (!q.current.length) setNote('') }
      return !error && !q.current.length
    } finally { flushing.current = false }
  }, [])

  // Đọc hành trình đang ghi của mình; app đóng quá lâu thì tự dừng, còn lại thì ghi tiếp
  const load = useCallback(async () => {
    const { data } = await sb.from('trips').select('*').eq('user_id', me.id).is('ended_at', null).limit(1)
    let cur = data?.[0] ?? null
    if (cur && tripRef.current?.id !== cur.id) {
      q.current = rd<Pt[]>(qk(cur.id), []); const s = rd<St | null>(sk(cur.id), null)
      st.current = s ?? { dist: cur.distance_m ?? 0, count: cur.point_count ?? 0, last: null }
    }
    if (cur && Date.now() - new Date(cur.last_at ?? cur.started_at).getTime() > STALE_MS) {
      tripRef.current = cur; await flush()
      const end = cur.last_at ?? cur.started_at   // thời điểm cuối cùng app còn ghi
      await sb.from('trips').update({ ended_at: end }).eq('id', cur.id)
      localStorage.removeItem(qk(cur.id)); localStorage.removeItem(sk(cur.id))
      setNote(`Hành trình “${cur.name}” đã tự dừng vì app đóng quá lâu. Các điểm đã ghi vẫn được giữ.`); cur = null; changed()
    }
    setTrip((p: any) => cur && p?.id === cur.id ? { ...p, ...cur } : cur)
  }, [me.id, flush])
  useEffect(() => { load(); const f = () => load(); window.addEventListener(TRIP_CHANGED, f); return () => window.removeEventListener(TRIP_CHANGED, f) }, [load])

  const stop = useCallback(async (why = '') => {
    const t = tripRef.current; if (!t) return
    setBusy(true)
    await flush()   // thử gửi nốt các điểm còn chờ
    if (q.current.length) { setBusy(false); return setNote('Chưa có mạng nên chưa lưu được các điểm cuối. Bạn vẫn đang ghi, hãy bấm Dừng lại khi có mạng nhé.') }
    const end = new Date().toISOString()
    const { error } = await sb.from('trips').update({ ended_at: end, distance_m: Math.round(st.current.dist), point_count: st.current.count, last_at: end }).eq('id', t.id)
    setBusy(false)
    if (error) return setNote('Chưa dừng được hành trình: ' + error.message)
    localStorage.removeItem(qk(t.id)); localStorage.removeItem(sk(t.id))
    setTrip(null); setNote(why); setGps(''); changed()
  }, [flush])
  useEffect(() => { const f = () => { stop() }; window.addEventListener(TRIP_STOP, f); return () => window.removeEventListener(TRIP_STOP, f) }, [stop])

  // Có hành trình đang ghi: theo dõi GPS, gửi định kỳ, giữ màn hình sáng
  const id = trip?.id as string | undefined
  useEffect(() => {
    if (!id) return
    const spaceId = tripRef.current.space_id
    const onPos = (p: GeolocationPosition) => {
      setGps('')
      const f: Fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy ?? null, t: p.timestamp || Date.now() }
      const a = accept(st.current.last, f); if (!a.ok) return
      st.current = { dist: st.current.dist + a.d, count: st.current.count + 1, last: f }
      q.current.push({ id: uid(), trip_id: id, space_id: spaceId, lat: f.lat, lng: f.lng, accuracy: f.acc, recorded_at: new Date(f.t).toISOString() })
      wr(qk(id), q.current); wr(sk(id), st.current)
      if (st.current.count >= MAX_POINTS) stop(`Hành trình đã tự dừng vì đủ ${MAX_POINTS} điểm. Bạn có thể bắt đầu một hành trình mới.`)
    }
    const onErr = (e: GeolocationPositionError) => setGps(e.code === 1 ? 'Chưa có quyền vị trí, hãy cho phép trong cài đặt trình duyệt' : 'Chưa lấy được vị trí, đang thử lại…')
    const watch = navigator.geolocation.watchPosition(onPos, onErr, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 })
    const every = setInterval(() => { flush(); tick(x => x + 1) }, 20000), show = setInterval(() => tick(x => x + 1), 5000)
    const lock = async () => {   // màn hình tắt thì trình duyệt ngừng cấp vị trí, nên mặc định giữ màn hình sáng khi đang ghi
      try { if (localStorage.getItem(AWAKE_KEY) !== '0' && 'wakeLock' in navigator && document.visibilityState === 'visible') wake.current = await (navigator as any).wakeLock.request('screen') } catch { }
    }
    const vis = () => { if (document.visibilityState === 'hidden') flush(); else { lock(); load() } }
    const online = () => { flush() }
    lock(); document.addEventListener('visibilitychange', vis); window.addEventListener('online', online); window.addEventListener('pagehide', online)
    return () => {
      navigator.geolocation.clearWatch(watch); clearInterval(every); clearInterval(show)
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('online', online); window.removeEventListener('pagehide', online)
      try { wake.current?.release() } catch { }; wake.current = null
    }
  }, [id, flush, stop, load])

  if (!trip) return note ? <div className="rec" role="status"><span>{note}</span><button className="pill" onClick={() => setNote('')}>Đóng</button></div> : null
  const s = st.current
  return <div className="rec on" role="status">
    <i className="dot" aria-hidden="true" />
    <Link href="/map" style={{ flex: 1 }}>Đang ghi hành trình · {fmtKm(s.dist)} · {fmtDur(Date.now() - new Date(trip.started_at).getTime())}{gps ? ` · ${gps}` : ''}{note ? ` · ${note}` : ''}</Link>
    <button className="pill" onClick={() => stop()} disabled={busy}>{busy ? 'Đang lưu…' : 'Dừng'}</button>
  </div>
}
