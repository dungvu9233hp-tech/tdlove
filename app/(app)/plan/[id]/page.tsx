'use client'
import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'

const ST = ['Ý tưởng', 'Đã chốt', 'Đã đi', 'Hủy']
const TY = ['Ăn', 'Uống', 'Tham quan', 'Di chuyển', 'Lưu trú', 'Khác']
const vnd = (n: number) => Math.round(n).toLocaleString('vi-VN') + 'đ'
const sum = (a: any[], k: string) => a.reduce((t, s) => t + (Number(s[k]) || 0), 0)

export default function PlanPage() {
  const { id } = useParams<{ id: string }>(); const r = useRouter()
  const { me, space, partner } = useApp()
  const [p, setP] = useState<any>(null); const [stops, setStops] = useState<any[]>([])
  const [day, setDay] = useState(1); const [add, setAdd] = useState(false)
  const [f, setF] = useState({ name: '', time: '', type: 'Ăn', est: '', address: '' })

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      sb.from('plans').select('*').eq('id', id).single(),
      sb.from('stops').select('*').eq('plan_id', id).order('day').order('start_time', { nullsFirst: false }).order('created_at')])
    setP(a.data); setStops(b.data ?? [])
  }, [id])
  useEffect(() => { load() }, [load])
  if (!p) return <div className="b s">Đang mở kế hoạch…</div>

  const nDays = p.start_date && p.end_date ? Math.max(1, Math.round((+new Date(p.end_date) - +new Date(p.start_date)) / 864e5) + 1) : 1
  const upd = async (sid: string, v: any) => { await sb.from('stops').update(v).eq('id', sid); load() }
  const del = async (sid: string) => { await sb.from('stops').delete().eq('id', sid); load() }
  const setStatus = async (status: string) => { await sb.from('plans').update({ status }).eq('id', id); load() }
  async function addStop() {
    if (!f.name.trim()) return
    await sb.from('stops').insert({ plan_id: id, space_id: space.id, day, start_time: f.time || null, type: f.type, name: f.name, address: f.address, est_cost: Number(f.est) || 0 })
    setF({ name: '', time: '', type: 'Ăn', est: '', address: '' }); setAdd(false); load()
  }
  async function toMoment() {
    await sb.from('moments').insert({ space_id: space.id, title: p.name, taken_on: p.end_date ?? p.start_date ?? new Date().toISOString().slice(0, 10), place: p.area })
    r.push('/moments')
  }

  const est = sum(stops, 'est_cost'), done = stops.filter(s => s.actual_cost != null)
  const act = sum(done, 'actual_cost'), diff = act - sum(done, 'est_cost')
  const paid = stops.filter(s => s.actual_cost != null && s.paid_by)
  const total = sum(paid, 'actual_cost'), mePaid = sum(paid.filter(s => s.paid_by === me.id), 'actual_cost')
  const owe = total / 2 - mePaid, pn = partner?.display_name ?? 'Người ấy'
  const today = stops.filter(s => s.day === day)
  const byType = TY.map(t => [t, sum(stops.filter(s => s.type === t), 'est_cost')]).filter(x => x[1] as number > 0)

  return <>
    <Head t={p.name} />
    <div className="b">
      <div className="row" style={{ flex: 'none', flexWrap: 'wrap' }}>{ST.map(s => <button key={s} className={`pill ${p.status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s}</button>)}</div>
      <div className="k pk">
        <b>Ngân sách dự kiến {vnd(est)}</b>
        {byType.length > 0 && <div className="s">{byType.map(([t, v]) => `${t} ${vnd(v as number)}`).join(', ')}</div>}
        {done.length > 0 && <div className="s">Thực tế {vnd(act)}, {diff > 0 ? 'vượt' : 'tiết kiệm'} {vnd(Math.abs(diff))} so với dự kiến</div>}
      </div>
      <div className="days">{Array.from({ length: nDays }, (_, i) => <button key={i} className={`pill ${day === i + 1 ? 'on' : ''}`} onClick={() => setDay(i + 1)}>Ngày {i + 1}</button>)}</div>
      <div className="s">Ngày {day}: dự kiến {vnd(sum(today, 'est_cost'))}</div>
      {!today.length && <div className="k pe"><div className="s">Chưa có điểm dừng nào trong ngày này.</div></div>}
      {today.map(s => <div key={s.id} className="k">
        <div className="row"><span className="pill on" style={{ flex: 'none' }}>{s.start_time?.slice(0, 5) ?? '--:--'}</span><div><b>{s.name}</b><div className="s">{s.type}, dự kiến {vnd(s.est_cost)}</div></div></div>
        <div className="row" style={{ marginTop: 8 }}>
          <input type="number" inputMode="numeric" placeholder="Thực tế (đ)" defaultValue={s.actual_cost ?? ''} onBlur={e => upd(s.id, { actual_cost: e.target.value === '' ? null : Number(e.target.value) })} />
          <select aria-label="Ai trả" value={s.paid_by ?? ''} onChange={e => upd(s.id, { paid_by: e.target.value || null })}>
            <option value="">Ai trả?</option><option value={me.id}>Bạn</option>{partner && <option value={partner.id}>{pn}</option>}
          </select>
          <button className="pill" style={{ flex: 'none' }} onClick={() => del(s.id)}>Xóa</button>
        </div>
      </div>)}
      {add ? <div className="k pk" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Điểm dừng mới (ngày {day})</b>
        <input placeholder="Tên, ví dụ: Quán lẩu gà lá é" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input type="time" value={f.time} onChange={e => setF({ ...f, time: e.target.value })} />
        <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })} style={{ maxWidth: 'none' }}>{TY.map(t => <option key={t}>{t}</option>)}</select>
        <input type="number" inputMode="numeric" placeholder="Chi phí dự kiến (đ)" value={f.est} onChange={e => setF({ ...f, est: e.target.value })} />
        <input placeholder="Địa chỉ" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
        <button className="btn" onClick={addStop}>Thêm điểm dừng</button>
      </div> : <button className="btn" onClick={() => setAdd(true)}>+ Thêm điểm dừng</button>}
      <div className="k li"><b>Chia tiền</b>
        <div className="s">{!total ? 'Nhập chi phí thực tế và người trả ở từng điểm dừng.' : Math.abs(owe) < 1 ? 'Hai đứa đã huề.' : owe > 0 ? `Bạn còn nợ ${pn} ${vnd(owe)}` : `${pn} còn nợ bạn ${vnd(-owe)}`}</div>
        {total > 0 && <div className="s">Tổng đã chi {vnd(total)}, chia đôi mỗi người {vnd(total / 2)}</div>}</div>
      {p.status === 'Đã đi' && <button className="btn" onClick={toMoment}>Tạo khoảnh khắc từ kế hoạch</button>}
    </div>
  </>
}
