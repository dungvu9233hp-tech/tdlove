'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'

const km = (a: any, b: any) => { const r = (x: number) => x * Math.PI / 180, d = r(b.lat - a.lat), e = r(b.lng - a.lng); return 12742 * Math.asin(Math.sqrt(Math.sin(d / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(e / 2) ** 2)) }
const live = (l: any) => !!l && new Date(l.share_until) > new Date()
const ago = (t: string) => { const s = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 1000)); return s < 60 ? `${s} giây trước` : `${Math.round(s / 60)} phút trước` }

export default function MapPage() {
  const { me, space, partner } = useApp()
  const el = useRef<HTMLDivElement>(null), map = useRef<any>(null), L = useRef<any>(null), pins = useRef<Record<string, any>>({}), fit = useRef(false)
  const [locs, setLocs] = useState<Record<string, any>>({})
  const [err, setErr] = useState(''); const [ready, setReady] = useState(false); const [, tick] = useState(0)
  const mine = locs[me.id], sharing = live(mine)
  const theirs = partner && live(locs[partner.id]) ? locs[partner.id] : null

  useEffect(() => {
    sb.from('locations').select('*').then(r => setLocs(Object.fromEntries((r.data ?? []).map(l => [l.user_id, l]))))
    const ch = sb.channel('loc-' + space.id).on('postgres_changes', { event: '*', schema: 'public', table: 'locations' }, p => {
      if (p.eventType === 'DELETE') setLocs(a => { const n = { ...a }; delete n[(p.old as any).user_id]; return n })
      else setLocs(a => ({ ...a, [(p.new as any).user_id]: p.new }))
    }).subscribe()
    const t = setInterval(() => tick(x => x + 1), 5000)
    return () => { sb.removeChannel(ch); clearInterval(t) }
  }, [space.id])

  useEffect(() => {
    let dead = false
    ;(async () => {
      const lf = (await import('leaflet')).default
      if (dead || !el.current || map.current) return
      L.current = lf
      map.current = lf.map(el.current, { zoomControl: false }).setView([21.0285, 105.8542], 13)
      lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
      setReady(true)
    })()
    return () => { dead = true; map.current?.remove(); map.current = null; pins.current = {}; fit.current = false; setReady(false) }
  }, [])

  useEffect(() => {
    if (!ready) return
    const show: Record<string, any> = {}
    if (sharing) show[me.id] = mine
    if (theirs) show[partner.id] = theirs
    Object.keys(pins.current).forEach(k => { if (!show[k]) { pins.current[k].remove(); delete pins.current[k] } })
    Object.entries(show).forEach(([id, l]) => {
      if (pins.current[id]) return pins.current[id].setLatLng([l.lat, l.lng])
      const d = document.createElement('div')
      d.className = 'pin' + (id === me.id ? ' on' : '')
      d.textContent = ((id === me.id ? me.display_name : partner.display_name) || '?')[0]
      pins.current[id] = L.current.marker([l.lat, l.lng], { icon: L.current.divIcon({ className: '', html: d, iconSize: [44, 44] }) }).addTo(map.current)
    })
    const pts = Object.values(show).map((l: any) => [l.lat, l.lng])
    if (!fit.current && pts.length) { fit.current = true; pts.length > 1 ? map.current.fitBounds(pts, { padding: [50, 50] }) : map.current.setView(pts[0], 16) }
  }, [locs, ready, sharing, !!theirs])

  const push = (p: GeolocationPosition, su: string) => sb.from('locations').upsert({ user_id: me.id, space_id: space.id, lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, updated_at: new Date().toISOString(), share_until: su })
  useEffect(() => {
    if (!sharing) return
    let last = 0
    const id = navigator.geolocation.watchPosition(p => { if (Date.now() - last < 8000) return; last = Date.now(); push(p, mine.share_until) }, () => {}, { enableHighAccuracy: true, maximumAge: 5000 })
    return () => navigator.geolocation.clearWatch(id)
  }, [sharing])

  const start = (h: number) => {
    const su = new Date(); h ? su.setTime(Date.now() + h * 36e5) : su.setHours(23, 59, 59, 0)
    setErr('')
    navigator.geolocation.getCurrentPosition(p => push(p, su.toISOString()), () => setErr('Không lấy được vị trí. Hãy cho phép trang web truy cập vị trí trong cài đặt trình duyệt.'), { enableHighAccuracy: true })
  }
  const stop = () => sb.from('locations').delete().eq('user_id', me.id)
  const [spots, setSpots] = useState<any[]>([])
  useEffect(() => { sb.from('stops').select('name,lat,lng,plans!inner(status)').not('lat', 'is', null).in('plans.status', ['Ý tưởng', 'Đã chốt']).limit(60).then(r => setSpots(r.data ?? [])) }, [])
  useEffect(() => {
    if (!ready) return
    const g = L.current.layerGroup().addTo(map.current)
    spots.forEach(s => L.current.circleMarker([s.lat, s.lng], { radius: 8, color: '#5B1F3A', weight: 2.5, fillColor: '#FFB3CF', fillOpacity: 1 }).bindTooltip(s.name).addTo(g))
    return () => { g.remove() }
  }, [ready, spots])
  const dist = sharing && theirs ? km(mine, theirs) : null

  return <>
    <Head t="Bản đồ">{sharing && <span className="pill on">Đang chia sẻ</span>}</Head>
    <div className="b">
      <div ref={el} className="mapbox" />
      {err && <div className="k pe s" role="alert">{err}</div>}
      <div className="k pk">
        {sharing ? <>
          <b>Đang chia sẻ vị trí của mình</b>
          <div className="s">Đến {new Date(mine.share_until).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</div>
          <button className="pill" onClick={stop}>Tắt chia sẻ</button>
        </> : <>
          <b>Chia sẻ vị trí của mình</b>
          <div className="s">Chỉ cập nhật khi app đang mở</div>
          <div className="row">{([['1 giờ', 1], ['4 giờ', 4], ['Hết hôm nay', 0]] as [string, number][]).map(([l, h]) => <button key={l} className="pill" onClick={() => start(h)}>{l}</button>)}</div>
        </>}
      </div>
      {theirs ? <div className="k">
        <b>{dist == null ? 'Người ấy đang chia sẻ vị trí' : `Cách nhau ${dist < 1 ? Math.round(dist * 1000) + ' m' : dist.toFixed(1).replace('.', ',') + ' km'}`}</b>
        <div className="s">Cập nhật {ago(theirs.updated_at)}, sai số ±{Math.round(theirs.accuracy ?? 0)} m</div>
      </div> : <div className="k"><div className="s">Người ấy chưa chia sẻ vị trí.</div></div>}
      {theirs && <a className="btn" href={`https://www.google.com/maps/dir/?api=1&destination=${theirs.lat},${theirs.lng}`} target="_blank" rel="noreferrer">Chỉ đường đến người ấy</a>}
    </div>
  </>
}
