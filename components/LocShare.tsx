'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'

export const LOC_CHANGED = 'tdlove-loc-changed'
const GAP_MS = 8000

// Chia sẻ vị trí chạy ở mọi màn hình (MAP-02, MAP-03), cùng cách với TripBar:
// - đang chia sẻ thì vẫn cập nhật vị trí khi bạn chuyển sang trang khác trong app;
// - luôn hiện thanh báo rõ ràng "Đang chia sẻ vị trí" kèm nút Tắt;
// - hết giờ thì tự dừng. Bản đồ chỉ bắt đầu/tắt chia sẻ rồi phát sự kiện LOC_CHANGED để thanh này nạp lại.
export default function LocShare() {
  const { me, space } = useApp()
  const [row, setRow] = useState<any>(null)
  const [, tick] = useState(0)
  const [busy, setBusy] = useState(false)
  const rowRef = useRef<any>(null); rowRef.current = row

  const load = useCallback(async () => {
    const { data, error } = await sb.from('locations').select('*').eq('user_id', me.id).maybeSingle()
    if (!error) setRow(data ?? null)
  }, [me.id])
  useEffect(() => {
    load()
    const f = () => load()
    window.addEventListener(LOC_CHANGED, f)
    const vis = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', vis)
    return () => { window.removeEventListener(LOC_CHANGED, f); document.removeEventListener('visibilitychange', vis) }
  }, [load])

  const until = row?.share_until as string | undefined
  const live = !!until && new Date(until).getTime() > Date.now()

  useEffect(() => {
    if (!until) return
    const left = new Date(until).getTime() - Date.now()
    if (left <= 0) return
    const t = setTimeout(() => tick(x => x + 1), left + 500)   // hết giờ thì ẩn thanh báo và dừng theo dõi
    return () => clearTimeout(t)
  }, [until])

  useEffect(() => {
    if (!live || !until || !('geolocation' in navigator)) return
    let last = 0
    const id = navigator.geolocation.watchPosition(async p => {
      if (Date.now() - last < GAP_MS) return
      last = Date.now()
      const next = { user_id: me.id, space_id: space.id, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, updated_at: new Date().toISOString(), share_until: until }
      const { error } = await sb.from('locations').upsert(next)
      if (!error) setRow(next)
    }, () => { }, { enableHighAccuracy: true, maximumAge: 5000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [live, until, me.id, space.id])

  async function stop() {
    setBusy(true)
    const { error } = await sb.from('locations').delete().eq('user_id', me.id)
    setBusy(false)
    if (error) return alert('Không tắt được chia sẻ: ' + error.message)
    setRow(null); window.dispatchEvent(new Event(LOC_CHANGED))
  }

  if (!live) return null
  return <div className="rec on" role="status">
    <i className="dot" aria-hidden="true" />
    <Link href="/map" style={{ flex: 1 }}>Đang chia sẻ vị trí · đến {new Date(until!).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</Link>
    <button className="pill" onClick={stop} disabled={busy}>{busy ? 'Đang tắt…' : 'Tắt'}</button>
  </div>
}
