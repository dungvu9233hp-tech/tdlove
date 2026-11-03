'use client'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import { geocode, reverse, type Place } from '@/lib/media'

// Chọn địa điểm trên bản đồ: chạm bản đồ, tìm theo tên, hoặc lấy vị trí hiện tại (MOM-01)
export default function PlacePicker({ value, onClose, onPick }: { value?: { lat: number; lng: number } | null; onClose: () => void; onPick: (p: Place) => void }) {
  const el = useRef<HTMLDivElement>(null), map = useRef<any>(null), L = useRef<any>(null), mk = useRef<any>(null)
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(value ?? null)
  const [name, setName] = useState(''); const [q, setQ] = useState(''); const [res, setRes] = useState<Place[]>([])
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false)

  const icon = () => { const d = document.createElement('div'); d.className = 'pin on'; d.textContent = '♥'; return L.current.divIcon({ className: '', html: d, iconSize: [44, 44] }) }
  const put = async (lat: number, lng: number, nm?: string, fly = false) => {
    setPt({ lat, lng }); setRes([])
    if (mk.current) mk.current.setLatLng([lat, lng]); else if (L.current) mk.current = L.current.marker([lat, lng], { icon: icon() }).addTo(map.current)
    if (fly) map.current?.setView([lat, lng], 16)
    setName(nm ?? ''); if (nm == null) setName(await reverse(lat, lng))
  }
  useEffect(() => {
    let dead = false
    ;(async () => {
      const lf = (await import('leaflet')).default
      if (dead || !el.current || map.current) return
      L.current = lf
      map.current = lf.map(el.current, { zoomControl: false }).setView(value ? [value.lat, value.lng] : [21.0285, 105.8542], value ? 16 : 13)
      lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map.current)
      if (value) mk.current = lf.marker([value.lat, value.lng], { icon: icon() }).addTo(map.current)
      map.current.on('click', (e: any) => put(e.latlng.lat, e.latlng.lng))
    })()
    return () => { dead = true; map.current?.remove(); map.current = null; mk.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const search = async () => {
    if (!q.trim() || busy) return
    setBusy(true); setMsg('')
    try { const r = await geocode(q.trim()); setRes(r); if (!r.length) setMsg('Không tìm thấy, thử gõ tên khác hoặc chạm thẳng lên bản đồ.') }
    catch (e: any) { setMsg(e.message) } finally { setBusy(false) }
  }
  const here = () => {
    setMsg(''); navigator.geolocation.getCurrentPosition(p => put(p.coords.latitude, p.coords.longitude, undefined, true),
      () => setMsg('Không lấy được vị trí. Hãy cho phép trang web truy cập vị trí.'), { enableHighAccuracy: true, timeout: 15000 })
  }

  return <div className="call" style={{ zIndex: 1500, justifyContent: 'flex-start', gap: 10, alignItems: 'stretch' }} role="dialog" aria-label="Chọn địa điểm">
    <div className="row"><b style={{ flex: 1 }}>Chọn địa điểm</b><button className="pill" style={{ flex: 'none' }} onClick={onClose}>Đóng</button></div>
    <div className="row k" style={{ padding: '6px 14px' }}>
      <input placeholder="Tìm: Hồ Tây, quán cà phê…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
      <button className="pill on" style={{ flex: 'none' }} onClick={search} disabled={busy}>{busy ? '…' : 'Tìm'}</button>
    </div>
    {res.length > 0 && <div className="k" style={{ padding: 6, maxHeight: 150, overflowY: 'auto' }}>{res.map((r, i) => <button key={i} className="pill" style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderRadius: 12 }} onClick={() => put(r.lat, r.lng, r.name, true)}>{r.name}</button>)}</div>}
    {msg && <div className="s" role="alert">{msg}</div>}
    <div ref={el} className="mapbox" style={{ flex: 1, height: 'auto', minHeight: 220, width: '100%' }} />
    <button className="pill" onClick={here}>Dùng vị trí hiện tại của mình</button>
    {pt && <input className="k" style={{ padding: '8px 14px' }} aria-label="Tên địa điểm" placeholder="Tên địa điểm" value={name} onChange={e => setName(e.target.value)} />}
    <button className="btn" disabled={!pt} onClick={() => pt && onPick({ ...pt, name: name.trim() })}>{pt ? 'Chọn chỗ này' : 'Chạm lên bản đồ để chọn'}</button>
  </div>
}
