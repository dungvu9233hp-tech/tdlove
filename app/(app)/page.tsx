'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head, { Heart } from '@/components/Head'
import Avatar from '@/components/Avatar'
import LoveHeart from '@/components/LoveHeart'
import Mascot from '@/components/Mascot'
import { NotifBell } from '@/components/Notifs'
import { daysTogether, ok, MILESTONES, nextMonthAnniv, nextYearlyDate } from '@/lib/util'
import { startDateError, todayStr } from '@/lib/profile'

const DAY = 864e5
const midnight = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t }

export default function Home() {
  const { me, space, partner, reload } = useApp()
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    sb.from('messages').select('id', { count: 'exact', head: true }).neq('sender', me.id).is('seen_at', null).then(r => setUnread(r.count ?? 0))
  }, [me.id])
  const [plan, setPlan] = useState<any>(null)
  useEffect(() => {
    sb.from('plans').select('id,name,start_date').in('status', ['Ý tưởng', 'Đã chốt']).gte('end_date', todayStr()).order('start_date').limit(1).then(r => setPlan(r.data?.[0] ?? null))
  }, [])
  const [latest, setLatest] = useState<any>(null)
  useEffect(() => {
    // HOME-01: Moment mới nhất
    sb.from('moments').select('id,title,taken_on,place').is('deleted_at', null).order('taken_on', { ascending: false }).order('created_at', { ascending: false }).limit(1).then(r => { if (!r.error) setLatest(r.data?.[0] ?? null) })
  }, [])
  const [specials, setSpecials] = useState<any[]>([])
  useEffect(() => {
    // ANNIV-04: ngày đặc biệt tự đặt cũng hiện ở Trang chủ
    sb.from('special_dates').select('name,on_date,yearly').then(r => { if (!r.error) setSpecials(r.data ?? []) })
  }, [])
  const [memo, setMemo] = useState<any[]>([])
  useEffect(() => {
    // DIARY-02: nhật ký + Moment của đúng ngày này các năm trước (hàm on_this_day, phase7.sql); ngày theo giờ máy
    const t = new Date(), today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
    sb.rpc('on_this_day', { d: today }).then(r => { if (r.error) console.error('on_this_day', r.error.message); else setMemo((r.data ?? []).filter((m: any) => !m.is_private || m.author === me.id)) })
  }, [me.id])
  const [cap, setCap] = useState({ ready: 0, wait: 0 })
  useEffect(() => {
    // CAPSULE-03: số hộp thời gian người ấy gửi mà đã mở được (chưa mở) và số hộp còn đang chờ (phase12.sql)
    sb.from('capsules').select('author,unlock_at,opened_at').then(r => {
      if (r.error) return
      const t = Date.now(), rows = r.data ?? []
      setCap({ ready: rows.filter(c => c.author !== me.id && !c.opened_at && +new Date(c.unlock_at) <= t).length, wait: rows.filter(c => +new Date(c.unlock_at) > t).length })
    })
  }, [me.id])
  const [fun, setFun] = useState(0)
  useEffect(() => {
    // ENT-04: số clip TikTok người ấy gửi mà mình chưa xem (phase13.sql)
    sb.from('clips').select('id', { count: 'exact', head: true }).neq('sender', me.id).is('seen_at', null).then(r => { if (!r.error) setFun(r.count ?? 0) })
  }, [me.id])
  const [gm, setGm] = useState(0)
  useEffect(() => {
    // Số ván trò chơi đang chờ mình hành động (phase24.sql)
    sb.from('games').select('waiting').eq('status', 'playing').then(r => { if (!r.error) setGm((r.data ?? []).filter((g: any) => (g.waiting ?? []).includes(me.id)).length) })
  }, [me.id])
  const day = space.start_date ? daysTogether(space.start_date) : null
  // Mốc/kỷ niệm gần nhất (kể cả hôm nay): mốc ngày, kỷ niệm tháng/năm và ngày đặc biệt tự đặt
  const next = (() => {
    const t0 = midnight(), c: { t: string; n: number }[] = []
    if (space.start_date && day) {
      const m = MILESTONES.find(m => m >= day); if (m) c.push({ t: `Ngày thứ ${m}`, n: m - day })
      const ma = nextMonthAnniv(space.start_date)
      if (ma) c.push({ t: ma.months % 12 ? `Kỷ niệm ${ma.months} tháng` : `Kỷ niệm ${ma.months / 12} năm`, n: Math.round((+ma.date - +t0) / DAY) })
    }
    for (const s of specials) {
      const [y, mo, d] = s.on_date.split('-').map(Number)
      const dt = s.yearly ? nextYearlyDate(s.on_date) : new Date(y, mo - 1, d)
      const n = Math.round((+dt - +t0) / DAY); if (n >= 0) c.push({ t: s.name, n })
    }
    return c.sort((a, b) => a.n - b.n)[0] ?? null
  })()
  const expired = !!space.invite_expires && new Date(space.invite_expires).getTime() < Date.now()
  const renew = async () => { const { error } = await sb.rpc('renew_invite'); if (error) alert(error.message); else reload() }
  const setDate = async (v: string) => { const bad = startDateError(v); if (bad) { alert(bad); return }; if (await ok(sb.from('spaces').update({ start_date: v }).eq('id', space.id), 'Không lưu được ngày bắt đầu')) reload() }

  return <>
    <Head t="tdlove"><NotifBell /><Link href="/settings" className="pill">Cài đặt</Link></Head>
    <div className="b stagger">
      <Link href="/level" className="lh-link" aria-label={`${day ? `${day} ngày bên nhau. ` : ''}Mở khu cấp độ của hai đứa`}>
        <LoveHeart days={day} />
      </Link>
      <Mascot uid={me.id} name={me.display_name || 'bạn'} partnerName={partner?.display_name} days={day}
        unread={unread} capsuleReady={cap.ready} clips={fun} games={gm} next={next} plan={plan ? { id: plan.id, name: plan.name } : null}
        memo={memo[0] ? { href: memo[0].kind === 'diary' ? `/diary?month=${memo[0].day.slice(0, 7)}` : `/moments?open=${memo[0].id}`, title: memo[0].title, year: memo[0].day.slice(0, 4) } : null} />
      {partner && <div className="couple">
        <div className="couple-row"><Avatar p={me} size={52} on /><Heart size={22} /><Avatar p={partner} size={52} /></div>
        <div className="couple-names">{me.display_name}<i>{'&'}</i>{partner.display_name}</div></div>}
      {!partner && <div className="k pe"><b>Mời người ấy vào Space</b>{expired ? <div className="s">Mã mời đã hết hạn.</div> : <><div className="s">Mã mời: <span style={{ fontSize: 22, userSelect: 'all' }}>{space.invite_code}</span></div><div className="s">Dùng một lần, hết hạn sau 24 giờ</div></>}<button className="pill" style={{ marginTop: 8 }} onClick={renew}>Tạo mã mới</button></div>}
      {!space.start_date && <label className="k li"><b>Hai đứa bắt đầu yêu từ ngày nào?</b><input type="date" min="1950-01-01" max={todayStr()} onChange={e => e.target.value && setDate(e.target.value)} /></label>}
      {next && <Link href="/special" className="k pk hero-k"><div><b>{next.n === 0 ? `Hôm nay: ${next.t} 🎉` : `Sắp tới: ${next.t}`}</b><div className="s">{next.n === 0 ? 'Chúc mừng hai đứa!' : `Còn ${next.n} ngày nữa`}</div></div>{next.n > 0 && <div className="big" aria-hidden="true"><span className="num">{next.n}</span><span>ngày</span></div>}</Link>}
      {latest && <Link href={`/moments?open=${latest.id}`} className="k hero-k"><div><b>Moment mới nhất: {latest.title}</b><div className="s">{new Date(latest.taken_on + 'T00:00:00').toLocaleDateString('vi-VN')}{latest.place ? ` · ${latest.place}` : ''}</div></div></Link>}
      {plan && <Link href={`/plan/${plan.id}`} className="k pe hero-k"><div><b>Sắp đi: {plan.name}</b><div className="s">{plan.start_date ? new Date(plan.start_date).toLocaleDateString('vi-VN') : 'Chưa chọn ngày'}</div></div></Link>}
      {memo.length > 0 && <div className="k li"><b>Ngày này năm trước</b>{memo.map(m => <Link key={m.kind + m.id} href={m.kind === 'diary' ? `/diary?month=${m.day.slice(0, 7)}` : `/moments?open=${m.id}`} className="s" style={{ display: 'block' }}>{m.kind === 'diary' ? (m.is_private ? '🔒' : '📓') : '📷'} {m.day.slice(0, 4)}: {m.title}</Link>)}{memo.some(m => m.kind === 'moment') && <Link href="/moments?memories=1" className="pill on" style={{ marginTop: 8 }}>▶ Xem lại ảnh</Link>}</div>}
      <div className="k lst">
        <Link href="/diary" className="rowl"><div><b>Nhật ký</b><div className="s">Viết cho nhau</div></div></Link>
        <Link href="/special" className="rowl"><div><b>Ngày đặc biệt</b><div className="s">Mốc kỷ niệm</div></div></Link>
        <Link href="/capsule" className="rowl"><div><b>Hộp thời gian</b><div className="s">{cap.ready ? `${cap.ready} hộp mở được rồi, vào xem nhé!` : cap.wait ? `${cap.wait} hộp đang chờ ngày mở` : 'Viết thư, hẹn ngày mở'}</div></div>{cap.ready > 0 && <i className="pulse" aria-hidden="true" />}</Link>
        <Link href="/fun" className="rowl"><div><b>Giải trí</b><div className="s">{fun ? `${fun} clip mới từ ${partner?.display_name ?? 'người ấy'}, xem nhé!` : 'Clip TikTok hai đứa gửi nhau'}</div></div>{fun > 0 && <i className="pulse" aria-hidden="true" />}</Link>
        <Link href="/games" className="rowl"><div><b>Trò chơi</b><div className="s">{gm ? `${gm} ván đang chờ bạn, vào chơi nhé!` : 'Caro, phá thuyền, bài, vẽ và đoán…'}</div></div>{gm > 0 && <i className="pulse" aria-hidden="true" />}</Link>
        <Link href="/chat" className="rowl"><div><b>{unread ? `${unread} tin mới` : 'Không có tin mới'}</b><div className="s">Từ {partner?.display_name ?? 'người ấy'}</div></div>{unread > 0 && <i className="pulse" aria-hidden="true" />}</Link>
        <Link href="/moments" className="rowl"><div><b>Khoảnh khắc</b><div className="s">Lưu thêm một kỷ niệm</div></div></Link>
        <Link href="/photobooth" className="rowl"><div><b>Photobooth</b><div className="s">Chọn frame, ghép ảnh, lưu mẫu để dùng lại</div></div></Link>
        <Link href="/photobooth/gallery" className="rowl"><div><b>Góc Photobooth</b><div className="s">Đăng thành phẩm và mẫu, thả tim, bình luận</div></div></Link>
      </div>
    </div>
  </>
}
