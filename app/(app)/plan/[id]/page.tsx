'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { shrink, km, coords, ok, safeUrl } from '@/lib/util'
import Head from '@/components/Head'
import { todayStr } from '@/lib/profile'

const ST = ['Ý tưởng', 'Đã chốt', 'Đã đi', 'Hủy']
const TY = ['Ăn', 'Uống', 'Tham quan', 'Di chuyển', 'Lưu trú', 'Khác']
const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN') + 'đ'
const sum = (a: any[], k: string) => a.reduce((t, s) => t + (Number(s[k]) || 0), 0)
const mins = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5)
const empty = { name: '', time: '', end: '', day: 1, type: 'Ăn', est: '', address: '', link: '', hours: '', phone: '', review: '', note: '' }
const votes = (s: any, v: number) => Object.values(s.likes ?? {}).filter(x => x === v).length

// Cảnh báo giữa hai điểm dừng liền kề: ngược giờ, trùng giờ, không kịp di chuyển
function warn(a: any, b: any) {
  if (!a.start_time || !b.start_time) return ''
  const g = mins(b.start_time) - mins(a.start_time)
  if (g < 0) return 'Giờ đang ngược thứ tự'
  if (g === 0) return 'Hai điểm trùng giờ'
  if (a.lat && b.lat) { const m = Math.round(km(a, b) / 30 * 60); return m > g ? `Di chuyển ước tính ${m} phút nhưng chỉ cách ${g} phút` : `Di chuyển khoảng ${m} phút` }
  return ''
}

export default function PlanPage() {
  const { id } = useParams<{ id: string }>(); const r = useRouter()
  const { me, space, partner } = useApp()
  const [p, setP] = useState<any>(null); const [stops, setStops] = useState<any[]>([]); const [items, setItems] = useState<any[]>([])
  const [wish, setWish] = useState<any[]>([]); const [cover, setCover] = useState(''); const [wx, setWx] = useState<any>(null)
  const [day, setDay] = useState(1); const [add, setAdd] = useState(false); const [f, setF] = useState(empty); const [todo, setTodo] = useState('')
  const [editId, setEditId] = useState<string | null>(null)                                   // T15: đang sửa điểm dừng nào (null = thêm mới)
  const [pEdit, setPEdit] = useState(false); const [pf, setPf] = useState({ name: '', start: '', end: '', area: '' })   // T15: sửa thông tin kế hoạch

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      sb.from('plans').select('*').eq('id', id).single(),
      sb.from('stops').select('*').eq('plan_id', id).order('day').order('sort'),
      sb.from('checklist_items').select('*').eq('plan_id', id).order('created_at'),
      sb.from('wishlist_places').select('*').eq('visited', false)])
    setP(a.data); setStops(b.data ?? []); setItems(c.data ?? []); setWish(d.data ?? [])
    if (a.data?.cover_path) setCover((await sb.storage.from('media').createSignedUrl(a.data.cover_path, 3600)).data?.signedUrl ?? '')
  }, [id])
  useEffect(() => { load() }, [load])

  // Hai người cùng sửa, thấy thay đổi ngay
  useEffect(() => {
    const ch = sb.channel('plan-' + id)
    ;['stops', 'checklist_items'].forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `plan_id=eq.${id}` }, () => load()))
    ch.on('postgres_changes', { event: '*', schema: 'public', table: 'plans', filter: `id=eq.${id}` }, () => load()).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [id, load])

  // Dự báo thời tiết (Open-Meteo, không cần khóa; chỉ có trong 16 ngày tới)
  useEffect(() => {
    if (!p?.start_date) return
    ;(async () => {
      try {
        const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(p.area || p.name)}`)).json()
        const c = g.results?.[0]; if (!c) return
        const w = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.latitude}&longitude=${c.longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${p.start_date}&end_date=${p.end_date || p.start_date}`)).json()
        setWx(w.daily ?? null)
      } catch { setWx(null) }
    })()
  }, [p?.start_date, p?.end_date, p?.area])

  if (!p) return <div className="b s">Đang mở kế hoạch…</div>
  const nDays = p.start_date && p.end_date ? Math.max(1, Math.round((+new Date(p.end_date) - +new Date(p.start_date)) / 864e5) + 1) : 1
  // Luôn load() lại sau khi ghi, để giao diện khớp với server kể cả khi ghi thất bại
  const upd = async (sid: string, v: any) => { await ok(sb.from('stops').update(v).eq('id', sid)); load() }
  const del = async (sid: string) => { await ok(sb.from('stops').delete().eq('id', sid), 'Không xóa được'); load() }
  const setStatus = async (status: string) => { await ok(sb.from('plans').update({ status }).eq('id', id)); load() }
  const today = stops.filter(s => s.day === day)
  const mv = async (i: number, d: number) => {
    const a = today[i], b = today[i + d]; if (!b) return
    const [x, y] = await Promise.all([sb.from('stops').update({ sort: b.sort }).eq('id', a.id), sb.from('stops').update({ sort: a.sort }).eq('id', b.id)])
    const e = x.error ?? y.error; if (e) alert('Không đổi được thứ tự: ' + e.message)
    load()
  }
  // L3: ghi riêng phiếu của mình bằng hàm phía server, không đọc rồi ghi đè cả cột likes (phase23.sql)
  const vote = async (s: any, v: number) => { await ok(sb.rpc('set_stop_vote', { p_stop: s.id, p_vote: s.likes?.[me.id] === v ? 0 : v })); load() }
  async function saveStop() {
    if (!f.name.trim()) return
    // Link chỉ nhận http(s): chặn javascript:... đi qua dữ liệu chia sẻ giữa hai người
    const link = safeUrl(f.link), review = safeUrl(f.review)
    if (f.link.trim() && !link) return alert('Link Google Maps không hợp lệ')
    if (f.review.trim() && !review) return alert('Link review không hợp lệ')
    if (f.time && f.end && f.end <= f.time) return alert('Giờ kết thúc phải sau giờ bắt đầu')
    const row = { start_time: f.time || null, end_time: f.end || null, type: f.type, name: f.name.trim(), address: f.address, est_cost: Number(f.est) || 0, link: link ?? '', hours: f.hours, phone: f.phone, review_url: review ?? '', note: f.note }
    if (editId) {
      const old = stops.find(x => x.id === editId)
      const patch: any = { ...row, day: f.day }
      if ((link ?? '') !== (old?.link ?? '')) { const c = coords(link ?? '') as { lat?: number; lng?: number }; patch.lat = c.lat ?? null; patch.lng = c.lng ?? null }   // đổi link thì cập nhật tọa độ
      if (!await ok(sb.from('stops').update(patch).eq('id', editId), 'Không lưu được điểm dừng')) return
      setDay(f.day)
    } else if (!await ok(sb.from('stops').insert({ plan_id: id, space_id: space.id, day, ...row, ...coords(link ?? '') }), 'Không thêm được điểm dừng')) return
    setF(empty); setEditId(null); setAdd(false); load()
  }
  const startEdit = (s: any) => {
    setF({ name: s.name ?? '', time: s.start_time?.slice(0, 5) ?? '', end: s.end_time?.slice(0, 5) ?? '', day: s.day ?? 1, type: s.type ?? 'Khác', est: s.est_cost ? String(s.est_cost) : '', address: s.address ?? '', link: s.link ?? '', hours: s.hours ?? '', phone: s.phone ?? '', review: s.review_url ?? '', note: s.note ?? '' })
    setEditId(s.id); setAdd(true)
    setTimeout(() => document.getElementById('stop-form')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50)
  }
  const cancelStop = () => { setF(empty); setEditId(null); setAdd(false) }
  // T15: sửa tên/ngày/khu vực của kế hoạch, và xóa hẳn kế hoạch
  const startPlanEdit = () => { setPf({ name: p.name ?? '', start: p.start_date ?? '', end: p.end_date ?? '', area: p.area ?? '' }); setPEdit(true) }
  async function savePlan() {
    const name = pf.name.trim(); if (!name) return alert('Hãy nhập tên kế hoạch')
    if (pf.start && pf.end && pf.end < pf.start) return alert('Ngày kết thúc phải từ ngày bắt đầu trở đi')
    const end = pf.end || pf.start || null
    const days = pf.start && end ? Math.round((+new Date(end) - +new Date(pf.start)) / 864e5) + 1 : 1
    const maxDay = Math.max(1, ...stops.map(x => x.day ?? 1))
    if (maxDay > days && !confirm(`Có điểm dừng ở ngày ${maxDay} nhưng kế hoạch mới chỉ còn ${days} ngày. Các điểm đó sẽ không hiện cho tới khi bạn kéo dài lại kế hoạch hoặc chuyển ngày. Vẫn lưu?`)) return
    if (await ok(sb.from('plans').update({ name, start_date: pf.start || null, end_date: end, area: pf.area.trim() }).eq('id', id), 'Không lưu được kế hoạch')) { setPEdit(false); setDay(1); load() }
  }
  async function delPlan() {
    if (!confirm(`Xóa kế hoạch "${p.name}"? Toàn bộ điểm dừng và danh sách chuẩn bị sẽ mất. Khoảnh khắc và nhật ký đã gắn với kế hoạch vẫn được giữ.`)) return
    // xóa ảnh bìa trước khi xóa dòng (xem T10)
    if (p.cover_path) { const { error } = await sb.storage.from('media').remove([p.cover_path]); if (error) return alert('Không xóa được ảnh bìa: ' + error.message) }
    if (await ok(sb.from('plans').delete().eq('id', id), 'Không xóa được kế hoạch')) r.replace('/plan')
  }
  const fromWish = (wid: string) => { const w = wish.find(x => x.id === wid); if (w) setF({ ...f, name: w.name, address: w.area ?? '', link: w.link ?? '', note: w.dish ?? '', type: 'Ăn' }) }
  async function setCoverFile(file?: File) {
    if (!file) return
    const path = `${space.id}/${crypto.randomUUID()}.jpg`
    const { error } = await sb.storage.from('media').upload(path, await shrink(file), { contentType: 'image/jpeg' })
    if (error) return alert('Không tải được ảnh bìa: ' + error.message)
    if (await ok(sb.from('plans').update({ cover_path: path }).eq('id', id), 'Không lưu được ảnh bìa')) load()
  }
  const addTodo = async () => { if (!todo.trim()) return; if (!await ok(sb.from('checklist_items').insert({ plan_id: id, space_id: space.id, text: todo }))) return; setTodo(''); load() }
  async function toMoment() {
    const { data, error } = await sb.from('moments').insert({ space_id: space.id, title: p.name, taken_on: p.end_date ?? p.start_date ?? todayStr(), place: p.area, plan_id: id }).select('id').single()
    if (error || !data) return alert('Không tạo được khoảnh khắc: ' + (error?.message ?? ''))
    r.push('/moments?edit=' + data.id)   // mở sẵn form sửa để thêm ảnh/video
  }
  const setShare = async (v: number) => {
    if (!partner || isNaN(v)) return
    const x = Math.min(100, Math.max(0, v)); await ok(sb.from('plans').update({ share: { [me.id]: x, [partner.id]: 100 - x } }).eq('id', id)); load()
  }

  const est = sum(stops, 'est_cost'), done = stops.filter(s => s.actual_cost != null)
  const act = sum(done, 'actual_cost'), diff = act - sum(done, 'est_cost')
  const paid = stops.filter(s => s.actual_cost != null && s.paid_by)
  const total = sum(paid, 'actual_cost'), mePaid = sum(paid.filter(s => s.paid_by === me.id), 'actual_cost')
  const myPct = p.share?.[me.id] ?? 50, owe = total * myPct / 100 - mePaid, pn = partner?.display_name ?? 'Người ấy'
  const byType = TY.map(t => [t, sum(stops.filter(s => s.type === t), 'est_cost')]).filter(x => (x[1] as number) > 0)
  const wd = wx?.time?.[day - 1] != null ? wx : null

  return <>
    <Head t={p.name}><label className="pill">Ảnh bìa<input type="file" accept="image/*" hidden onChange={e => setCoverFile(e.target.files?.[0])} /></label></Head>
    <div className="b">
      {cover && <img src={cover} alt={p.name} style={{ flex: 'none', width: '100%', height: 150, objectFit: 'cover', borderRadius: 22, border: '2.5px solid var(--ink)' }} />}
      <div className="row" style={{ flex: 'none', flexWrap: 'wrap' }}>{ST.map(s => <button key={s} className={`pill ${p.status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <div className="row" style={{ flex: 'none', flexWrap: 'wrap' }}><button className="pill" onClick={() => pEdit ? setPEdit(false) : startPlanEdit()}>{pEdit ? 'Đóng' : 'Sửa kế hoạch'}</button><button className="pill" onClick={delPlan}>Xóa kế hoạch</button></div>
      {pEdit && <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Sửa kế hoạch</b>
        <input placeholder="Tên chuyến đi" value={pf.name} onChange={e => setPf({ ...pf, name: e.target.value })} />
        <label className="s">Từ ngày<input type="date" value={pf.start} onChange={e => setPf({ ...pf, start: e.target.value })} /></label>
        <label className="s">Đến ngày<input type="date" value={pf.end} onChange={e => setPf({ ...pf, end: e.target.value })} /></label>
        <input placeholder="Khu vực" value={pf.area} onChange={e => setPf({ ...pf, area: e.target.value })} />
        <button className="btn" onClick={savePlan}>Lưu</button>
      </div>}
      <div className="k pk">
        <b>Ngân sách dự kiến {vnd(est)}</b>
        {byType.length > 0 && <div className="s">{byType.map(([t, v]) => `${t} ${vnd(v as number)}`).join(', ')}</div>}
        {done.length > 0 && <div className="s">Thực tế {vnd(act)}, {diff > 0 ? 'vượt' : 'tiết kiệm'} {vnd(Math.abs(diff))} so với dự kiến</div>}
      </div>
      <div className="days">{Array.from({ length: nDays }, (_, i) => <button key={i} className={`pill ${day === i + 1 ? 'on' : ''}`} onClick={() => setDay(i + 1)}>Ngày {i + 1}</button>)}</div>
      <div className="s">Ngày {day}: dự kiến {vnd(sum(today, 'est_cost'))}{wd && `, trời ${Math.round(wd.temperature_2m_min[day - 1])}–${Math.round(wd.temperature_2m_max[day - 1])}°C, mưa ${wd.precipitation_probability_max[day - 1] ?? 0}%`}</div>
      {!today.length && <div className="k pe"><div className="s">Chưa có điểm dừng nào trong ngày này.</div></div>}
      {today.map((s, i) => <div key={s.id}>
        {i > 0 && warn(today[i - 1], s) && <div className="s" style={{ textAlign: 'center', margin: '0 0 8px' }}>{warn(today[i - 1], s)}</div>}
        <div className="k">
          <div className="row"><span className="pill on" style={{ flex: 'none' }}>{s.start_time?.slice(0, 5) ?? '--:--'}{s.end_time ? `–${s.end_time.slice(0, 5)}` : ''}</span><div><b>{s.name}</b><div className="s">{s.type}, dự kiến {vnd(s.est_cost)}</div></div>
            <span className="rb" style={{ display: 'flex', flexDirection: 'column', gap: 4, border: 0, background: 'none', width: 'auto', height: 'auto' }}>
              <button className="pill" onClick={() => mv(i, -1)} aria-label="Đưa lên">▲</button><button className="pill" onClick={() => mv(i, 1)} aria-label="Đưa xuống">▼</button></span></div>
          {s.address && <div className="s">{s.address}</div>}
          {s.hours && <div className="s">Mở cửa: {s.hours}</div>}
          {s.note && <div>{s.note}</div>}
          <div className="row" style={{ marginTop: 6, flexWrap: 'wrap' }}>
            <a className="pill" href={safeUrl(s.link) ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name + ' ' + (s.address ?? ''))}`} target="_blank" rel="noreferrer">Bản đồ</a>
            {s.phone && <a className="pill" href={`tel:${String(s.phone).replace(/[^\d+*#]/g, '')}`}>Gọi</a>}
            {safeUrl(s.review_url) && <a className="pill" href={safeUrl(s.review_url)} target="_blank" rel="noreferrer">Review</a>}
            <button className={`pill ${s.likes?.[me.id] === 1 ? 'on' : ''}`} onClick={() => vote(s, 1)}>Thích {votes(s, 1)}</button>
            <button className={`pill ${s.likes?.[me.id] === -1 ? 'on' : ''}`} onClick={() => vote(s, -1)}>Không {votes(s, -1)}</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input key={s.actual_cost ?? 'none'} type="number" inputMode="numeric" placeholder="Thực tế (đ)" defaultValue={s.actual_cost ?? ''} onBlur={e => upd(s.id, { actual_cost: e.target.value === '' ? null : Number(e.target.value) })} />
            <select aria-label="Ai trả" value={s.paid_by ?? ''} onChange={e => upd(s.id, { paid_by: e.target.value || null })}>
              <option value="">Ai trả?</option><option value={me.id}>Bạn</option>{partner && <option value={partner.id}>{pn}</option>}
            </select>
            <button className="pill" style={{ flex: 'none' }} onClick={() => startEdit(s)}>Sửa</button>
            <button className="pill" style={{ flex: 'none' }} onClick={() => del(s.id)}>Xóa</button>
          </div>
        </div>
      </div>)}
      {add ? <div id="stop-form" className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>{editId ? 'Sửa điểm dừng' : `Điểm dừng mới (ngày ${day})`}</b>
        {editId && <label className="s">Ngày<select value={f.day} onChange={e => setF({ ...f, day: Number(e.target.value) })} style={{ maxWidth: 'none' }}>{Array.from({ length: Math.max(nDays, f.day) }, (_, i) => <option key={i} value={i + 1}>Ngày {i + 1}</option>)}</select></label>}
        {!editId && wish.length > 0 && <select style={{ maxWidth: 'none' }} defaultValue="" onChange={e => fromWish(e.target.value)}><option value="">Chọn từ quán muốn thử</option>{wish.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        <input placeholder="Tên, ví dụ: Quán lẩu gà lá é" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <label className="s">Giờ bắt đầu<input type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} /></label>
        <label className="s">Giờ kết thúc (không bắt buộc)<input type="time" value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
        <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} style={{ maxWidth: 'none' }}>{TY.map(t => <option key={t}>{t}</option>)}</select>
        <input type="number" inputMode="numeric" placeholder="Chi phí dự kiến (đ)" value={f.est} onChange={e => setF({ ...f, est: e.target.value })} />
        <input placeholder="Địa chỉ" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
        <input placeholder="Link Google Maps (dán link dài để hiện lên bản đồ)" value={f.link} onChange={e => setF({ ...f, link: e.target.value })} />
        <input placeholder="Giờ mở cửa, ví dụ: 10:00 đến 21:00" value={f.hours} onChange={e => setF({ ...f, hours: e.target.value })} />
        <input type="tel" placeholder="Số điện thoại" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
        <input placeholder="Link review" value={f.review} onChange={e => setF({ ...f, review: e.target.value })} />
        <textarea rows={2} placeholder="Ghi chú" value={f.note} onChange={e => setF({ ...f, note: e.target.value })} />
        <button className="btn" onClick={saveStop}>{editId ? 'Lưu điểm dừng' : 'Thêm điểm dừng'}</button>
        {editId && <button className="pill" onClick={cancelStop}>Hủy sửa</button>}
      </div> : <button className="btn" onClick={() => { setF({ ...empty, day }); setAdd(true) }}>+ Thêm điểm dừng</button>}
      <div className="k"><b>Chuẩn bị</b>
        {items.map(c => <div key={c.id} className="row" style={{ margin: '6px 0' }}>
          <label className="row" style={{ justifyContent: 'flex-start' }}><input type="checkbox" style={{ width: 22, flex: 'none' }} checked={c.done} onChange={async e => { await ok(sb.from('checklist_items').update({ done: e.target.checked }).eq('id', c.id)); load() }} /><span style={{ textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span></label>
          <button className="pill" style={{ flex: 'none' }} onClick={async () => { await ok(sb.from('checklist_items').delete().eq('id', c.id), 'Không xóa được'); load() }} aria-label="Xóa">×</button></div>)}
        <label className="row"><input placeholder="Thêm việc: đặt phòng, mua vé…" value={todo} onChange={e => setTodo(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTodo()} /><button className="pill" style={{ flex: 'none' }} onClick={addTodo}>Thêm</button></label></div>
      <div className="k li"><b>Chia tiền</b>
        <div className="s">{!total ? 'Nhập chi phí thực tế và người trả ở từng điểm dừng.' : Math.abs(owe) < 1 ? 'Hai đứa đã huề.' : owe > 0 ? `Bạn còn nợ ${pn} ${vnd(owe)}` : `${pn} còn nợ bạn ${vnd(-owe)}`}</div>
        {total > 0 && <div className="s">Tổng đã chi {vnd(total)}, bạn chịu {myPct}% ({vnd(total * myPct / 100)})</div>}
        {partner && <label className="s row" style={{ marginTop: 6 }}>Bạn chịu (%)<input type="number" inputMode="numeric" defaultValue={myPct} key={myPct} onBlur={e => setShare(Number(e.target.value))} /></label>}</div>
      {p.status === 'Đã đi' && <button className="btn" onClick={toMoment}>Tạo khoảnh khắc từ kế hoạch</button>}
    </div>
  </>
}
