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
  const day = space.start_date ? Math.floor((Date.now() - new Date(space.start_date).getTime()) / 864e5) + 1 : null
  const next = day ? MILESTONES.find(m => m > day) : null
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
      {!partner && <div className="k pe"><b>Mời người ấy vào Space</b><div className="s">Mã mời: <span style={{ fontSize: 22, userSelect: 'all' }}>{space.invite_code}</span></div><div className="s">Dùng một lần, hết hạn sau 24 giờ</div></div>}
      <div className="row">
        <Link href="/chat" className="k li"><b>{unread ? `${unread} tin mới` : 'Không có tin mới'}</b><div className="s">Từ {partner?.display_name ?? 'người ấy'}</div></Link>
        <Link href="/moments" className="k"><b>Khoảnh khắc</b><div className="s">Lưu thêm một kỷ niệm</div></Link>
      </div>
    </div>
  </>
}
