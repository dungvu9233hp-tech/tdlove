'use client'
import { useCallback, useEffect, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok } from '@/lib/util'
import { TRIP_CHANGED, TRIP_STOP, fmtDur, fmtKm, loadPoints, startTrip } from '@/lib/trip'
import { AWAKE_KEY } from '@/components/TripBar'

export type Route = { points: [number, number][]; name: string; mine: boolean }
const day = (s: string) => new Date(s).toLocaleDateString('vi-VN')

// Bảng "Hành trình" trên trang Bản đồ (MAP-07): bắt đầu/dừng ghi, xem lại trên bản đồ, cho người ấy xem, xóa
export default function TripPanel({ onShow }: { onShow: (r: Route | null) => void }) {
  const { me, space, partner } = useApp()
  const [trips, setTrips] = useState<any[]>([]); const [plans, setPlans] = useState<any[]>([])
  const [name, setName] = useState(''); const [planId, setPlanId] = useState(''); const [awake, setAwake] = useState(true)
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [openId, setOpenId] = useState<string | null>(null)
  const load = useCallback(() => { sb.from('trips').select('*, plans(name)').order('started_at', { ascending: false }).limit(50).then(r => setTrips(r.data ?? [])) }, [])
  useEffect(() => {
    load(); window.addEventListener(TRIP_CHANGED, load)
    sb.from('plans').select('id,name,status').neq('status', 'Hủy').order('start_date', { ascending: false, nullsFirst: true }).limit(20).then(r => setPlans(r.data ?? []))
    setAwake(localStorage.getItem(AWAKE_KEY) !== '0')
    return () => { window.removeEventListener(TRIP_CHANGED, load); onShow(null) }
  }, [load])
  const active = trips.find(t => t.user_id === me.id && !t.ended_at)
  const mine = trips.filter(t => t.user_id === me.id && t.ended_at), theirs = trips.filter(t => t.user_id !== me.id)

  function start() {
    setMsg('')
    if (!navigator.geolocation) return setMsg('Trình duyệt này không hỗ trợ định vị.')
    const plan = plans.find(p => p.id === planId)
    const n = name.trim() || plan?.name || `Hành trình ${day(new Date().toISOString())}`
    if ([...n].length > 60) return setMsg('Tên hành trình tối đa 60 ký tự')
    setBusy(true)
    // xin quyền vị trí ngay khi bấm nút (iOS/Safari yêu cầu), rồi mới tạo hành trình
    navigator.geolocation.getCurrentPosition(async () => {
      try { localStorage.setItem(AWAKE_KEY, awake ? '1' : '0'); await startTrip(space.id, n, planId || null); setName(''); setPlanId('') }
      catch (e: any) { setMsg(e.message) }
      setBusy(false)
    }, () => { setMsg('Không lấy được vị trí. Hãy cho phép trang web truy cập vị trí trong cài đặt trình duyệt.'); setBusy(false) }, { enableHighAccuracy: true, timeout: 20000 })
  }
  async function view(t: any) {
    if (openId === t.id) { setOpenId(null); return onShow(null) }
    setMsg(''); setBusy(true)
    try {
      const points = await loadPoints(t.id)
      if (points.length < 2) setMsg('Hành trình này chưa đủ điểm để vẽ đường đi.')
      else { setOpenId(t.id); onShow({ points, name: t.name, mine: t.user_id === me.id }) }
    } catch (e: any) { setMsg('Không tải được hành trình: ' + e.message) }
    setBusy(false)
  }
  const share = async (t: any) => { if (await ok(sb.from('trips').update({ shared: !t.shared }).eq('id', t.id), 'Không đổi được chế độ chia sẻ')) load() }
  async function del(t: any) {
    if (!confirm(`Xóa hành trình “${t.name}”? Toàn bộ các điểm đã ghi sẽ bị xóa vĩnh viễn.`)) return
    if (await ok(sb.from('trips').delete().eq('id', t.id), 'Không xóa được hành trình')) { if (openId === t.id) { setOpenId(null); onShow(null) } load() }
  }
  async function delAll() {
    if (!confirm(`Xóa tất cả ${mine.length} hành trình đã ghi của bạn? Không khôi phục được.`)) return
    if (await ok(sb.from('trips').delete().eq('user_id', me.id).not('ended_at', 'is', null), 'Không xóa được')) { setOpenId(null); onShow(null); load() }
  }

  const row = (t: any, own: boolean) => <div key={t.id} className="k" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <b>{t.name}</b>
    <div className="s">{day(t.started_at)} · {fmtKm(t.distance_m)} · {fmtDur(new Date(t.ended_at ?? t.last_at ?? t.started_at).getTime() - new Date(t.started_at).getTime())} · {t.point_count} điểm{t.plans?.name ? ` · ${t.plans.name}` : ''}</div>
    {!own && <div className="s">Người ấy chia sẻ với bạn</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button className={'pill' + (openId === t.id ? ' on' : '')} onClick={() => view(t)} disabled={busy} aria-pressed={openId === t.id}>{openId === t.id ? 'Ẩn đường đi' : 'Xem trên bản đồ'}</button>
      {own && partner && <button className={'pill' + (t.shared ? ' on' : '')} onClick={() => share(t)} aria-pressed={t.shared}>{t.shared ? 'Người ấy đang xem được' : 'Cho người ấy xem'}</button>}
      {own && <button className="pill" onClick={() => del(t)}>Xóa</button>}
    </div>
  </div>

  return <>
    <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {active ? <>
        <b>Đang ghi: {active.name}</b>
        <div className="s">{fmtKm(active.distance_m)} · {active.point_count} điểm. Chỉ ghi khi app đang mở; thanh trên cùng cho bạn dừng ở bất cứ màn hình nào.</div>
        <button className="pill on" onClick={() => window.dispatchEvent(new Event(TRIP_STOP))} style={{ alignSelf: 'flex-start' }}>Dừng ghi hành trình</button>
      </> : <>
        <b>Ghi lại hành trình</b>
        <div className="s">Chỉ ghi khi bạn bấm bắt đầu. Chỉ mình bạn xem được, trừ khi bạn bấm “Cho người ấy xem”. Xóa được bất cứ lúc nào.</div>
        <label className="k s" style={{ display: 'block' }}><input value={name} onChange={e => setName(e.target.value)} placeholder="Tên hành trình (không bắt buộc)" aria-label="Tên hành trình" /></label>
        {plans.length > 0 && <label className="s">Gắn với kế hoạch
          <select value={planId} onChange={e => setPlanId(e.target.value)} style={{ maxWidth: '100%', width: '100%', marginTop: 4 }}><option value="">Không gắn</option>{plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className="s" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={awake} onChange={e => setAwake(e.target.checked)} style={{ width: 22, height: 22, flex: 'none' }} />Giữ màn hình sáng khi đang ghi (nên bật: màn hình tắt thì trình duyệt ngừng cấp vị trí, nhưng tốn pin hơn)</label>
        <button className="pill on" onClick={start} disabled={busy} style={{ alignSelf: 'flex-start' }}>{busy ? 'Đang bắt đầu…' : 'Bắt đầu ghi'}</button>
      </>}
      {msg && <div className="s" role="alert">{msg}</div>}
    </div>
    {mine.length > 0 && <><b>Hành trình của mình</b>{mine.map(t => row(t, true))}<button className="pill" onClick={delAll} style={{ alignSelf: 'flex-start' }}>Xóa tất cả hành trình đã ghi</button></>}
    {theirs.length > 0 && <><b>Người ấy chia sẻ</b>{theirs.map(t => row(t, false))}</>}
  </>
}
