'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok } from '@/lib/util'
import Head from '@/components/Head'
import { embedSrc, funcUrl, hasTikTok, sendClip } from '@/lib/clips'

const hhmm = (s: string) => new Date(s).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const dmy = (s: string) => new Date(s).toLocaleDateString('vi-VN')
const clamp2: React.CSSProperties = { overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }

export default function Fun() {
  const { me, space, partner } = useApp()
  const pn = partner?.display_name ?? 'Người ấy'
  const [clips, setClips] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [link, setLink] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const [cur, setCur] = useState<any>(null)                     // clip đang xem
  const [tok, setTok] = useState('')                            // mã gửi nhanh vừa tạo (chỉ hiện một lần)
  const [bad, setBad] = useState<Record<string, boolean>>({})   // ảnh bìa đã hỏng (link của TikTok có hạn dùng)

  const load = useCallback(async () => {
    const r = await sb.from('clips').select('*').order('created_at', { ascending: false }).limit(100)
    if (r.error) { setErr('Chưa tải được danh sách clip. Đã chạy supabase/phase13.sql chưa?'); setClips([]) }
    else { setErr(''); setClips(r.data ?? []) }
  }, [])

  useEffect(() => {
    load()
    const ch = sb.channel('clips-' + space.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clips', filter: `space_id=eq.${space.id}` },
        p => setClips(a => { const n: any = p.new; return !a || a.some(x => x.id === n.id) ? a : [n, ...a] }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clips', filter: `space_id=eq.${space.id}` },
        p => setClips(a => { const n: any = p.new; return a && a.map(x => x.id === n.id ? n : x) }))
      // DELETE không lọc được theo Space; chỉ mang theo id nên bỏ qua id không có trong danh sách của mình
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clips' },
        p => setClips(a => { const o: any = p.old; return a && a.filter(x => x.id !== o.id) }))
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [space.id, load])

  useEffect(() => {
    if (!cur) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setCur(null) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [cur])

  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return
    setBusy(true); setMsg('')
    const r = await sendClip(t)
    setBusy(false); setMsg(r.message)
    if (r.ok) { setLink(''); load() }
  }
  // Cách nhanh nhất khi không dùng được Phím tắt: bấm "Sao chép liên kết" trong TikTok, quay lại đây bấm nút này
  async function paste() {
    try {
      const t = await navigator.clipboard.readText()
      if (!hasTikTok(t)) return setMsg('Trong bộ nhớ tạm chưa có link TikTok. Bấm “Sao chép liên kết” trong TikTok trước nhé.')
      await send(t)
    } catch { setMsg('Máy không cho đọc bộ nhớ tạm. Hãy dán link vào ô bên dưới rồi bấm Gửi.') }
  }

  function open(c: any) {
    setCur(c)
    if (c.sender !== me.id && !c.seen_at) {
      const at = new Date().toISOString()
      ok(sb.rpc('open_clip', { cid: c.id }), 'Không đánh dấu đã xem được').then(g => { if (g) setClips(a => a && a.map(x => x.id === c.id ? { ...x, seen_at: at } : x)) })
    }
  }
  async function del(c: any) {
    if (!confirm('Xóa clip này khỏi danh sách của cả hai?')) return
    if (!await ok(sb.from('clips').delete().eq('id', c.id), 'Không xóa được')) return
    setClips(a => a && a.filter(x => x.id !== c.id)); setCur(null)
  }

  async function makeToken() {
    if (!confirm('Nếu bạn đã tạo mã trước đó, mã cũ (và Phím tắt đang dùng nó) sẽ ngừng hoạt động. Tạo mã mới?')) return
    const { data, error } = await sb.rpc('create_share_token')
    if (error) return alert('Không tạo được mã: ' + error.message)
    setTok(String(data))
  }
  async function dropToken() {
    if (!confirm('Tắt gửi nhanh? Phím tắt đang dùng mã này sẽ không gửi được nữa.')) return
    if (await ok(sb.rpc('revoke_share_token'), 'Không tắt được')) { setTok(''); setMsg('Đã tắt gửi nhanh') }
  }
  const copy = async (s: string) => { try { await navigator.clipboard.writeText(s); setMsg('Đã sao chép') } catch { setMsg('Không sao chép được, hãy giữ ngón tay lên chữ để chép tay') } }

  return <>
    <Head t="Giải trí"><Link href="/" className="pill">Trang chủ</Link></Head>
    <div className="b">
      <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>Gửi clip TikTok cho {pn}</b>
        <button className="btn" onClick={paste} disabled={busy}>{busy ? 'Đang gửi…' : 'Dán link đã sao chép và gửi'}</button>
        <div className="row">
          <label className="k s"><input value={link} onChange={e => setLink(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(link)} placeholder="Hoặc dán link TikTok vào đây…" aria-label="Link TikTok" inputMode="url" /></label>
          <button className="rb" onClick={() => send(link)} disabled={busy}>Gửi</button>
        </div>
        {msg && <div className="s" role="status">{msg}</div>}
      </div>

      {err && <div className="k pe"><div className="s">{err}</div></div>}
      {clips === null && <div className="s">Đang tải…</div>}
      {clips && !clips.length && !err && <div className="k pe"><b>Chưa có clip nào</b><div className="s">Clip hai đứa gửi nhau sẽ hiện ở đây, bấm vào là xem ngay trong app.</div></div>}
      {clips?.map(c => {
        const mine = c.sender === me.id
        return <button key={c.id} type="button" className={`k ${mine ? 'pk' : 'li'}`} onClick={() => open(c)}
          style={{ display: 'flex', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
          <span style={{ flex: 'none', width: 56, height: 72, borderRadius: 12, border: '2px solid var(--ink)', background: '#fff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }} aria-hidden="true">
            {c.thumb_url && !bad[c.id] ? <img src={c.thumb_url} alt="" referrerPolicy="no-referrer" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => setBad(b => ({ ...b, [c.id]: true }))} /> : '▶'}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <b style={clamp2}>{c.title ?? 'Clip TikTok'}</b>
            <span className="s" style={{ display: 'block' }}>{mine ? 'Bạn' : pn} · {c.author_name ? `@${c.author_name} · ` : ''}{dmy(c.created_at)} {hhmm(c.created_at)}</span>
            {c.note && <span className="s" style={{ display: 'block', ...clamp2 }}>{c.note}</span>}
          </span>
          {!mine && !c.seen_at ? <span className="pill on" style={{ flex: 'none' }}>Mới</span> : mine && c.seen_at ? <span className="s" style={{ flex: 'none' }}>Đã xem</span> : null}
        </button>
      })}

      <details className="k pe">
        <summary style={{ cursor: 'pointer' }}><b style={{ display: 'inline' }}>Gửi nhanh từ TikTok (Phím tắt iPhone)</b></summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <div className="s">Cài một lần, sau đó trong TikTok chỉ cần Chia sẻ rồi chọn “Gửi cho {pn}”. Mỗi người tạo mã riêng của mình, và mã chỉ hiện đúng một lần.</div>
          <button className="pill" onClick={makeToken} style={{ alignSelf: 'flex-start' }}>Tạo mã gửi nhanh</button>
          {tok && <>
            <div className="s">Mã của bạn (giữ kín như mật khẩu):</div>
            <div className="k" style={{ userSelect: 'all', overflowWrap: 'anywhere', fontSize: 14 }}>{tok}</div>
            <button className="pill" onClick={() => copy(tok)} style={{ alignSelf: 'flex-start' }}>Sao chép mã</button>
            <div className="s">Địa chỉ để dán vào Phím tắt:</div>
            <div className="k" style={{ userSelect: 'all', overflowWrap: 'anywhere', fontSize: 14 }}>{funcUrl}</div>
            <button className="pill" onClick={() => copy(funcUrl)} style={{ alignSelf: 'flex-start' }}>Sao chép địa chỉ</button>
          </>}
          <div className="s">Các bước tạo Phím tắt nằm trong README, mục “Giải trí”.</div>
          <button className="pill" onClick={dropToken} style={{ alignSelf: 'flex-start' }}>Tắt gửi nhanh</button>
        </div>
      </details>
    </div>

    {cur && <div className="sheet" role="dialog" aria-modal="true" aria-label="Xem clip">
      <div className="row"><b style={{ ...clamp2, flex: 1 }}>{cur.title ?? 'Clip TikTok'}</b><button className="pill" style={{ flex: 'none' }} onClick={() => setCur(null)}>Đóng</button></div>
      <iframe key={cur.id} src={embedSrc(cur.video_id)} title="Clip TikTok" allow="autoplay; fullscreen; encrypted-media"
        style={{ width: '100%', height: 'min(72dvh, 640px)', flex: 'none', border: '2.5px solid var(--ink)', borderRadius: 22, background: '#000' }} />
      <div className="s">{cur.sender === me.id ? 'Bạn' : pn} gửi lúc {hhmm(cur.created_at)}, {dmy(cur.created_at)}{cur.author_name ? ` · @${cur.author_name}` : ''}</div>
      <div className="row" style={{ justifyContent: 'flex-start' }}>
        <a className="pill" style={{ flex: 'none' }} href={cur.url} target="_blank" rel="noopener noreferrer">Mở trong TikTok</a>
        <button className="pill" style={{ flex: 'none' }} onClick={() => del(cur)}>Xóa</button>
      </div>
    </div>}
  </>
}
