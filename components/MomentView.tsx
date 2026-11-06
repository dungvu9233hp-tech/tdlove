'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { sign, TAG_EMOJI } from '@/lib/media'
import { ok } from '@/lib/util'
import Lightbox from '@/components/Lightbox'

const fmt = (d: string) => new Date(d).toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric', year: 'numeric' })

// Chi tiết một Moment: ảnh/video, thả tim, bình luận, sửa, xóa (MOM-05, MOM-07)
export default function MomentView({ m, me, partner, plan, albumNames, onClose, onEdit, onDelete, onChanged }: {
  m: any; me: any; partner: any; plan?: any; albumNames: string[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onChanged: () => void
}) {
  const media = (m.media ?? []).slice().sort((a: any, b: any) => a.sort - b.sort)
  const [url, setUrl] = useState<Record<string, string>>({}); const [lb, setLb] = useState<number | null>(null)
  const [hearts, setHearts] = useState<string[]>([]); const [cm, setCm] = useState<any[]>([]); const [text, setText] = useState(''); const [sending, setSending] = useState(false)
  const name = (id: string) => id === me.id ? 'Mình' : partner?.display_name ?? 'Người ấy'

  useEffect(() => { sign(media.flatMap((x: any) => [x.path, x.thumb_path])).then(setUrl) /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [m.id])
  // T13: link ký sống 5 phút nên để mở lâu rồi mới bấm thì đã chết. Ký lại lúc bấm xem ảnh lớn/video (TTL 1 giờ),
  // và ký lại khi ảnh nhỏ báo lỗi (tối đa một lần mỗi 20 giây để không lặp vô hạn).
  const lastFix = useRef(0)
  const allPaths = () => media.flatMap((x: any) => [x.path, x.thumb_path])
  const refresh = async () => { if (Date.now() - lastFix.current < 20000) return; lastFix.current = Date.now(); setUrl(await sign(allPaths(), 300, true)) }
  const openLb = async (x: any) => {
    const u = await sign(media.map((m: any) => m.path), 3600, true)
    setUrl(a => ({ ...a, ...u }))
    const k = media.filter((m: any) => u[m.path]).findIndex((m: any) => m.id === x.id)
    if (k >= 0) setLb(k)
  }
  const load = useCallback(async () => {
    const [h, c] = await Promise.all([
      sb.from('moment_hearts').select('user_id').eq('moment_id', m.id),
      sb.from('moment_comments').select('*').eq('moment_id', m.id).order('created_at'),
    ])
    setHearts((h.data ?? []).map((x: any) => x.user_id)); setCm(c.data ?? [])
  }, [m.id])
  useEffect(() => {
    load()
    const ch = sb.channel('mom-' + m.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moment_hearts', filter: `moment_id=eq.${m.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'moment_comments', filter: `moment_id=eq.${m.id}` }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [m.id, load])

  const mine = hearts.includes(me.id)
  const heart = async () => {
    setHearts(a => mine ? a.filter(x => x !== me.id) : [...a, me.id])   // hiện ngay, lỗi thì tải lại
    const q = mine ? sb.from('moment_hearts').delete().eq('moment_id', m.id).eq('user_id', me.id) : sb.from('moment_hearts').insert({ moment_id: m.id, space_id: m.space_id })
    if (!await ok(q, 'Không thả tim được')) load(); else onChanged()
  }
  const send = async () => {
    const body = text.trim(); if (!body || sending) return
    setSending(true)
    if (await ok(sb.from('moment_comments').insert({ moment_id: m.id, space_id: m.space_id, body }), 'Không gửi được bình luận')) { setText(''); await load(); onChanged() }
    setSending(false)
  }
  const delCm = async (id: string) => { if (await ok(sb.from('moment_comments').delete().eq('id', id), 'Không xóa được bình luận')) { await load(); onChanged() } }

  const lbItems = media.map((x: any) => ({ kind: x.kind, url: url[x.path] })).filter((x: any) => x.url)
  return <div className="sheet" role="dialog" aria-label={m.title}>
    <div className="row"><b style={{ flex: 1 }}>{m.title}</b><button className="pill" style={{ flex: 'none' }} onClick={onClose}>Đóng</button></div>
    <div className="s">{fmt(m.taken_on)}</div>
    {media.length > 0 && <div className="mgrid" style={{ gridTemplateColumns: media.length === 1 ? '1fr' : 'repeat(3,1fr)' }}>
      {media.map((x: any, i: number) => {
        const t = url[x.thumb_path ?? (x.kind === 'image' ? x.path : '')]
        return <button key={x.id} className="th" onClick={() => openLb(x)} aria-label={`Xem ${x.kind === 'video' ? 'video' : 'ảnh'} ${i + 1}`} style={media.length === 1 ? { aspectRatio: '4/3' } : undefined}>
          {t ? <img src={t} alt="" onError={refresh} /> : x.kind === 'video' ? '🎬' : '🖼️'}
          {x.kind === 'video' && t && <span style={{ position: 'absolute', fontSize: 34 }}>▶️</span>}
        </button>
      })}
    </div>}
    <div className="k">
      {m.description && <div style={{ whiteSpace: 'pre-wrap', marginBottom: 6 }}>{m.description}</div>}
      {(m.tags ?? []).length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>{m.tags.map((t: string) => <span key={t} className="pill on">{TAG_EMOJI[t] ?? '🏷️'} {t}</span>)}</div>}
      {m.place && <div className="s">📍 {m.place}</div>}
      {m.lat != null && <a className="pill" style={{ marginTop: 6 }} href={`https://www.google.com/maps/search/?api=1&query=${m.lat},${m.lng}`} target="_blank" rel="noreferrer">Mở bản đồ</a>}
      {plan && <div style={{ marginTop: 6 }}><Link className="pill" href={`/plan/${plan.id}`}>🗓️ Kế hoạch: {plan.name}</Link></div>}
      {albumNames.length > 0 && <div className="s" style={{ marginTop: 6 }}>📁 {albumNames.join(', ')}</div>}
    </div>
    <div className="row"><button className={'pill heartbtn' + (mine ? ' on' : '')} style={{ flex: 'none' }} onClick={heart} aria-pressed={mine}>{mine ? '💗' : '🤍'} {hearts.length || ''} Thả tim</button>
      {hearts.length > 0 && <div className="s">{hearts.map(name).join(' và ')} đã thả tim</div>}</div>
    <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>Bình luận ({cm.length})</b>
      {cm.map(c => <div key={c.id}><span className="s">{name(c.author)} · {new Date(c.created_at).toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <div style={{ whiteSpace: 'pre-wrap' }}>{c.body}</div>
        {c.author === me.id && <button className="pill" style={{ padding: '0 10px' }} onClick={() => delCm(c.id)}>Xóa</button>}</div>)}
      <div className="row k" style={{ padding: '6px 14px', background: '#fff' }}>
        <input placeholder="Viết bình luận…" maxLength={1000} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} aria-label="Bình luận" />
        <button className="pill on" style={{ flex: 'none' }} onClick={send} disabled={sending}>Gửi</button></div>
    </div>
    <div className="row"><button className="btn" onClick={onEdit}>Sửa</button><button className="pill" onClick={onDelete}>Xóa</button></div>
    {lb != null && lbItems.length > 0 && <Lightbox items={lbItems} start={Math.max(0, lb)} caption={m.title} onClose={() => setLb(null)} />}
  </div>
}
