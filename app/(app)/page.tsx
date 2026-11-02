'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head, { Heart } from '@/components/Head'

const MILESTONES = [100, 200, 365, 500, 1000, 1500, 2000]

export default function Home() {
  const { me, space, partner, reload } = useApp()
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    sb.from('messages').select('id', { count: 'exact', head: true }).neq('sender', me.id).is('seen_at', null).then(r => setUnread(r.count ?? 0))
  }, [me.id])
  const [plan, setPlan] = useState<any>(null)
  useEffect(() => {
    sb.from('plans').select('id,name,start_date').in('status', ['Ý tưởng', 'Đã chốt']).gte('end_date', new Date().toISOString().slice(0, 10)).order('start_date').limit(1).then(r => setPlan(r.data?.[0] ?? null))
  }, [])
  const [memo, setMemo] = useState<any[]>([])
  useEffect(() => {
    const t = new Date(), md = `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    Promise.all([sb.from('diary_entries').select('title,entry_date').limit(500), sb.from('moments').select('title,taken_on').is('deleted_at', null).limit(500)]).then(([a, b]) =>
      setMemo([...(a.data ?? []).map((x: any) => ({ t: x.title || 'Nhật ký', d: x.entry_date })), ...(b.data ?? []).map((x: any) => ({ t: x.title, d: x.taken_on }))].filter(x => x.d?.slice(5) === md && +x.d.slice(0, 4) < t.getFullYear())))
  }, [])
  const day = space.start_date ? Math.floor((Date.now() - new Date(space.start_date).getTime()) / 864e5) + 1 : null
  const next = day ? MILESTONES.find(m => m > day) : null
  const expired = !!space.invite_expires && new Date(space.invite_expires).getTime() < Date.now()
  const renew = async () => { const { error } = await sb.rpc('renew_invite'); if (error) alert(error.message); else reload() }
  const setDate = async (v: string) => { await sb.from('spaces').update({ start_date: v }).eq('id', space.id); reload() }

  return <>
    <Head t="tdlove"><Link href="/settings" className="pill">Cài đặt</Link></Head>
    <div className="b">
      <div style={{ position: 'relative', height: 215, display: 'flex', justifyContent: 'center', flex: 'none' }}>
        <Heart size={215} />
        <div style={{ position: 'absolute', top: 58, textAlign: 'center' }}>
          <div className="num" style={{ fontSize: 66 }}>{day ?? '–'}</div>
          <div className="num" style={{ fontSize: 19, marginTop: 4 }}>ngày bên nhau</div>
        </div>
      </div>
      {!space.start_date && <label className="k li"><b>Hai đứa bắt đầu yêu từ ngày nào?</b><input type="date" onChange={e => e.target.value && setDate(e.target.value)} /></label>}
      {next && day && <div className="k pk"><b>Mốc kế tiếp: {next} ngày</b><div className="s">Còn {next - day} ngày nữa</div></div>}
      {plan && <Link href={`/plan/${plan.id}`} className="k pe"><b>Sắp đi: {plan.name}</b><div className="s">{plan.start_date ? new Date(plan.start_date).toLocaleDateString('vi-VN') : 'Chưa chọn ngày'}</div></Link>}
      {memo.length > 0 && <div className="k li"><b>Ngày này năm trước</b>{memo.map((m, i) => <div key={i} className="s">{m.d.slice(0, 4)}: {m.t}</div>)}</div>}
      <div className="row"><Link href="/diary" className="k pk"><b>Nhật ký</b><div className="s">Viết cho nhau</div></Link><Link href="/special" className="k pe"><b>Ngày đặc biệt</b><div className="s">Mốc kỷ niệm</div></Link></div>
      {!partner && <div className="k pe"><b>Mời người ấy vào Space</b>{expired ? <div className="s">Mã mời đã hết hạn.</div> : <><div className="s">Mã mời: <span style={{ fontSize: 22, userSelect: 'all' }}>{space.invite_code}</span></div><div className="s">Dùng một lần, hết hạn sau 24 giờ</div></>}<button className="pill" onClick={renew}>Tạo mã mới</button></div>}
      <div className="row">
        <Link href="/chat" className="k li"><b>{unread ? `${unread} tin mới` : 'Không có tin mới'}</b><div className="s">Từ {partner?.display_name ?? 'người ấy'}</div></Link>
        <Link href="/moments" className="k"><b>Khoảnh khắc</b><div className="s">Lưu thêm một kỷ niệm</div></Link>
      </div>
    </div>
  </>
}
