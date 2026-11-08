'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok } from '@/lib/util'
import { removePb, signPb } from '@/lib/pbstore'
import { OPEN_PBPOST, useNotifs } from '@/components/Notifs'

// Góc Photobooth (phase26.sql): hai người đăng thành phẩm và mẫu, thả tim, bình luận.
const when = (d: string) => new Date(d).toLocaleString('vi-VN', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })
const SHOW_REPLIES = 2
type Tab = 'all' | 'result' | 'template'
const TABS: [Tab, string][] = [['all', 'Tất cả'], ['result', 'Thành phẩm'], ['template', 'Mẫu']]
const thumbOf = (p: any): string | null => p.kind === 'template' ? p.tpl?.thumb_path ?? null : p.thumb_path
const fullOf = (p: any): string | null => p.kind === 'template' ? p.tpl?.preview_path ?? null : p.image_path

export default function PbGallery() {
  const { me, partner } = useApp()
  const { items, viewing } = useNotifs()
  const [posts, setPosts] = useState<any[]>([]); const [hearts, setHearts] = useState<any[]>([]); const [cc, setCc] = useState<Record<string, number>>({})
  const [url, setUrl] = useState<Record<string, string>>({}); const [tab, setTab] = useState<Tab>('all')
  const [open, setOpen] = useState<string | null>(null); const [off, setOff] = useState(false); const [ready, setReady] = useState(false)
  const name = useCallback((id: string) => id === me.id ? 'Mình' : partner?.display_name ?? 'Người ấy', [me.id, partner])

  const load = useCallback(async () => {
    const [p, h, c] = await Promise.all([
      sb.from('pb_posts').select('*, tpl:pb_templates(id,name,thumb_path,preview_path,owner)').order('created_at', { ascending: false }),
      sb.from('pb_hearts').select('post_id,user_id'),
      sb.from('pb_comments').select('post_id'),
    ])
    if (p.error) { console.warn('pb_posts', p.error.message); setOff(true); setReady(true); return }      // chưa chạy phase26.sql
    setOff(false); setPosts(p.data ?? []); setHearts(h.data ?? [])
    const n: Record<string, number> = {}; for (const x of c.data ?? []) n[x.post_id] = (n[x.post_id] ?? 0) + 1
    setCc(n); setReady(true)
    setUrl(await signPb((p.data ?? []).map(thumbOf)))
  }, [])
  useEffect(() => {
    load()
    const ch = sb.channel('pb-gal')
    for (const table of ['pb_posts', 'pb_hearts', 'pb_comments', 'pb_templates']) ch.on('postgres_changes', { event: '*', schema: 'public', table }, load)
    ch.subscribe()
    return () => { sb.removeChannel(ch) }
  }, [load])

  // mở thẳng một bài: /photobooth/gallery?open=<id> hoặc từ thông báo
  useEffect(() => { const id = new URLSearchParams(location.search).get('open'); if (id) setOpen(id) }, [])
  useEffect(() => {
    const h = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (id) setOpen(id) }
    window.addEventListener(OPEN_PBPOST, h); return () => window.removeEventListener(OPEN_PBPOST, h)
  }, [])

  const unread = useMemo(() => new Set(items.filter(n => !n.read_at && n.pb_post_id).map(n => n.pb_post_id as string)), [items])
  const shown = posts.filter(p => tab === 'all' || p.kind === tab)
  const cur = open ? posts.find(p => p.id === open) : null
  const hc = (id: string) => hearts.filter(h => h.post_id === id)

  return <>
    <div className="pb-row" role="tablist" aria-label="Lọc bài đăng">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`pill${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
    {off && <div className="k pe"><b>Chưa bật được Góc Photobooth</b><div className="s">Hãy chạy supabase/phase26.sql trong Supabase SQL Editor rồi tải lại trang.</div></div>}
    {!off && ready && !shown.length && <div className="k pe"><b>{tab === 'template' ? 'Chưa có mẫu nào được đăng' : 'Chưa có bài nào'}</b>
      <div className="s">Ghép ảnh ở Photobooth rồi bấm “Đăng lên Góc chung”, hoặc lưu một bố cục làm mẫu để cả hai cùng dùng.</div>
      <Link href="/photobooth" className="btn" style={{ marginTop: 8 }}>Mở Photobooth</Link></div>}
    <div className="pg-grid">{shown.map(p => {
      const mine = hc(p.id).some(h => h.user_id === me.id), u = url[thumbOf(p) ?? '']
      return <button key={p.id} className="k pg-card" onClick={() => setOpen(p.id)} aria-label={`Mở ${p.title}`}>
        <span className="pg-img">{u ? <img src={u} alt="" loading="lazy" decoding="async" /> : <span aria-hidden="true">🖼️</span>}
          {p.kind === 'template' && <span className="pg-badge">Mẫu</span>}{unread.has(p.id) && <span className="pg-new" aria-label="Mới">●</span>}</span>
        <b className="pg-t">{p.title}</b>
        <span className="s">{name(p.author)} · {when(p.created_at)}</span>
        <span className="s">{mine ? '💗' : '🤍'} {hc(p.id).length} · 💬 {cc[p.id] ?? 0}</span>
      </button>
    })}</div>
    {open && !cur && ready && !off && <div className="k pe"><b>Bài này không còn nữa</b><button className="pill" onClick={() => setOpen(null)}>Đóng</button></div>}
    {cur && <PostView key={cur.id} post={cur} me={me} name={name} viewing={viewing} onClose={() => setOpen(null)} onChanged={load} />}
  </>
}

function PostView({ post, me, name, viewing, onClose, onChanged }: { post: any; me: any; name: (id: string) => string; viewing: { current: string | null }; onClose: () => void; onChanged: () => void }) {
  const [img, setImg] = useState<string | null>(null); const [hearts, setHearts] = useState<string[]>([]); const [cm, setCm] = useState<any[]>([])
  const [text, setText] = useState(''); const [sending, setSending] = useState(false); const [replyTo, setReplyTo] = useState<any>(null); const [expanded, setExpanded] = useState<string[]>([])
  const [edit, setEdit] = useState(false); const [t1, setT1] = useState(post.title); const [t2, setT2] = useState(post.caption ?? ''); const [busy, setBusy] = useState(false)
  const inp = useRef<HTMLInputElement>(null)
  const path = fullOf(post), mine = post.author === me.id

  const fresh = useCallback(async () => { if (path) { const m = await signPb([path], 3600); setImg(m[path] ?? null) } }, [path])
  useEffect(() => { fresh() }, [fresh])
  const load = useCallback(async () => {
    const [h, c] = await Promise.all([
      sb.from('pb_hearts').select('user_id').eq('post_id', post.id),
      sb.from('pb_comments').select('*').eq('post_id', post.id).order('created_at'),
    ])
    setHearts((h.data ?? []).map((x: any) => x.user_id)); setCm(c.data ?? [])
  }, [post.id])
  useEffect(() => {
    load()
    const ch = sb.channel('pb-post-' + post.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pb_hearts', filter: `post_id=eq.${post.id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pb_comments', filter: `post_id=eq.${post.id}` }, load).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [post.id, load])
  // Đang xem bài này thì thông báo về nó coi như đã đọc
  useEffect(() => { viewing.current = post.id; return () => { if (viewing.current === post.id) viewing.current = null } }, [post.id, viewing])
  useEffect(() => {
    sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('pb_post_id', post.id).is('read_at', null)
      .then(r => { if (r.error) console.warn('notifications', r.error.message) })
  }, [post.id, cm.length])
  useEffect(() => { if (replyTo && !cm.some(c => c.id === replyTo.id)) setReplyTo(null) }, [cm, replyTo])

  const liked = hearts.includes(me.id)
  const heart = async () => {
    setHearts(a => liked ? a.filter(x => x !== me.id) : [...a, me.id])
    const q = liked ? sb.from('pb_hearts').delete().eq('post_id', post.id).eq('user_id', me.id) : sb.from('pb_hearts').insert({ post_id: post.id, space_id: post.space_id })
    if (!await ok(q, 'Không thả tim được')) load(); else onChanged()
  }
  const send = async () => {
    const body = text.trim(); if (!body || sending) return
    setSending(true)
    const root = replyTo ? (replyTo.parent_id ?? replyTo.id) : null
    if (await ok(sb.from('pb_comments').insert({ post_id: post.id, space_id: post.space_id, parent_id: root, body }), 'Không gửi được bình luận')) {
      if (root) setExpanded(a => a.includes(root) ? a : [...a, root])
      setText(''); setReplyTo(null); await load(); onChanged()
    }
    setSending(false)
  }
  const kids = (id: string) => cm.filter(c => c.parent_id === id)
  const delCm = async (c: any) => {
    const n = kids(c.id).length
    if (n && !confirm(`Xóa bình luận này và ${n} câu trả lời của nó?`)) return
    if (await ok(sb.from('pb_comments').delete().eq('id', c.id), 'Không xóa được bình luận')) { await load(); onChanged() }
  }
  const saveEdit = async () => {
    if (!t1.trim()) return alert('Tên bài không được để trống')
    setBusy(true)
    if (await ok(sb.from('pb_posts').update({ title: t1.trim(), caption: t2.trim() }).eq('id', post.id), 'Không lưu được')) { setEdit(false); onChanged() }
    setBusy(false)
  }
  const delPost = async () => {
    if (!confirm(post.kind === 'template' ? 'Gỡ mẫu này khỏi Góc Photobooth? Mẫu vẫn còn trong danh sách mẫu của hai đứa.' : 'Xóa bài này cùng các bình luận?')) return
    setBusy(true)
    if (await ok(sb.from('pb_posts').delete().eq('id', post.id), 'Không xóa được bài')) {
      if (post.kind === 'result') await removePb([post.image_path, post.thumb_path])      // ảnh của mẫu thuộc về mẫu nên không xóa theo bài
      onChanged(); onClose()
    }
    setBusy(false)
  }
  const download = async () => {
    const m = await signPb([path], 600); const u = m[path ?? '']; if (!u) return alert('Không tải được ảnh')
    const r = await fetch(u); if (!r.ok) return alert('Không tải được ảnh')
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = `tdlove-${post.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'photobooth'}.jpg`
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  const row = (c: any, isReply: boolean) => <div key={c.id} style={isReply ? { marginLeft: 12, paddingLeft: 10, borderLeft: '3px solid var(--ink2)' } : undefined}>
    <span className="s">{name(c.author)} · {when(c.created_at)}</span>
    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{c.body}</div>
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <button className="pill" style={{ padding: '0 10px' }} onClick={() => { setReplyTo(c); inp.current?.focus() }} aria-label={`Trả lời bình luận của ${name(c.author)}`}>Trả lời</button>
      {c.author === me.id && <button className="pill" style={{ padding: '0 10px' }} onClick={() => delCm(c)}>Xóa</button>}
    </div>
  </div>
  const tops = cm.filter(c => !c.parent_id)

  return <div className="sheet" role="dialog" aria-label={post.title}>
    <div className="row"><b style={{ flex: 1 }}>{post.title}</b><button className="pill" style={{ flex: 'none' }} onClick={onClose}>Đóng</button></div>
    <div className="s">{post.kind === 'template' ? 'Mẫu' : 'Thành phẩm'} · {name(post.author)} · {when(post.created_at)}</div>
    <div className="pg-big">{img ? <img src={img} alt={post.title} onError={fresh} /> : <span aria-hidden="true">🖼️</span>}</div>
    {edit ? <div className="k" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input className="pb-txt" maxLength={80} value={t1} onChange={e => setT1(e.target.value)} aria-label="Tên bài" />
      <textarea className="pb-txt" rows={3} maxLength={500} value={t2} onChange={e => setT2(e.target.value)} aria-label="Ghi chú" />
      <div className="row"><button className="btn" disabled={busy} onClick={saveEdit}>Lưu</button><button className="pill" onClick={() => { setEdit(false); setT1(post.title); setT2(post.caption ?? '') }}>Hủy</button></div></div>
      : post.caption && <div className="k" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{post.caption}</div>}
    <div className="row">
      <button className={'pill heartbtn' + (liked ? ' on' : '')} style={{ flex: 'none' }} onClick={heart} aria-pressed={liked}>{liked ? '💗' : '🤍'} {hearts.length || ''} Thả tim</button>
      {hearts.length > 0 && <div className="s">{hearts.map(name).join(' và ')} đã thả tim</div>}</div>
    <div className="pb-row">
      {post.kind === 'template' && post.template_id && <Link className="btn" href={`/photobooth?tpl=${post.template_id}`}>Dùng mẫu này</Link>}
      {post.kind === 'result' && <button className="pill" onClick={download}>Tải ảnh</button>}
      {mine && !edit && <button className="pill" onClick={() => setEdit(true)}>Sửa</button>}
      {mine && <button className="pill" disabled={busy} onClick={delPost}>{post.kind === 'template' ? 'Gỡ khỏi Góc chung' : 'Xóa'}</button>}
    </div>
    <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <b>Bình luận ({cm.length})</b>
      {!cm.length && <div className="s">Chưa có bình luận. Viết lời đầu tiên nhé.</div>}
      {tops.map(c => {
        const rs = kids(c.id), all = expanded.includes(c.id), hidden = all ? 0 : Math.max(0, rs.length - SHOW_REPLIES)
        return <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {row(c, false)}
          {hidden > 0 && <button className="pill" style={{ alignSelf: 'flex-start', marginLeft: 12 }} onClick={() => setExpanded(a => [...a, c.id])}>Xem {hidden} trả lời trước đó</button>}
          {rs.slice(hidden).map(r => row(r, true))}
        </div>
      })}
      {replyTo && <div className="k s" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 14px', background: '#fff' }} role="status">
        <span style={{ flex: 1, overflowWrap: 'anywhere' }}>Đang trả lời {name(replyTo.author)}: {String(replyTo.body).slice(0, 60)}</span>
        <button className="pill" style={{ flex: 'none' }} onClick={() => setReplyTo(null)} aria-label="Hủy trả lời">×</button></div>}
      <div className="row k" style={{ padding: '6px 14px', background: '#fff' }}>
        <input ref={inp} placeholder={replyTo ? `Trả lời ${name(replyTo.author)}…` : 'Viết bình luận…'} maxLength={1000} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} aria-label="Bình luận" />
        <button className="pill on" style={{ flex: 'none' }} onClick={send} disabled={sending}>Gửi</button></div>
    </div>
  </div>
}
