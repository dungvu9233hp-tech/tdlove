'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok } from '@/lib/util'
import Head from '@/components/Head'
import ClipViewer from '@/components/ClipViewer'
import { badges, clamp2, type Clip, dmy, funcUrl, hasTikTok, hhmm, QUICK_NOTES, sendClip } from '@/lib/clips'
import { useTogether } from '@/lib/together'

type Filter = 'all' | 'new' | 'star'

export default function Fun() {
  const { me, space, partner } = useApp()
  const pn = partner?.display_name ?? 'Người ấy'
  const tg = useTogether(space.id, me.id)
  const [clips, setClips] = useState<Clip[] | null>(null)
  const [err, setErr] = useState('')
  const [link, setLink] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState('')
  const [f, setF] = useState<Filter>('all')
  const [curId, setCurId] = useState<string | null>(null)      // clip đang xem
  const [join, setJoin] = useState(false)                       // mở clip từ lời rủ: vào thẳng phòng xem cùng
  const [inv, setInv] = useState<string | null>(null)           // clip người kia đang rủ xem cùng
  const cur = clips?.find(c => c.id === curId) ?? null          // lấy từ danh sách để cảm xúc/bình luận mới hiện ngay
  const deep = useRef<string | null>(null)
  const [tok, setTok] = useState('')                            // mã gửi nhanh vừa tạo (chỉ hiện một lần)
  const [bad, setBad] = useState<Record<string, boolean>>({})   // ảnh bìa đã hỏng (link của TikTok có hạn dùng)

  const load = useCallback(async () => {
    const r = await sb.from('clips').select('*').order('created_at', { ascending: false }).limit(100)
    if (r.error) { setErr('Chưa tải được danh sách clip. Đã chạy supabase/phase13.sql chưa?'); setClips([]) }
    else { setErr(''); setClips((r.data ?? []) as Clip[]) }
  }, [])

  useEffect(() => {
    load()
    const ch = sb.channel('clips-' + space.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clips', filter: `space_id=eq.${space.id}` },
        p => setClips(a => { const n = p.new as Clip; return !a || a.some(x => x.id === n.id) ? a : [n, ...a] }))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'clips', filter: `space_id=eq.${space.id}` },
        p => setClips(a => { const n = p.new as Clip; return a && a.map(x => x.id === n.id ? n : x) }))
      // DELETE không lọc được theo Space; chỉ mang theo id nên bỏ qua id không có trong danh sách của mình
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clips' },
        p => setClips(a => { const o: any = p.old; return a && a.filter(x => x.id !== o.id) }))
      .subscribe()
    return () => { sb.removeChannel(ch) }
  }, [space.id, load])

  useEffect(() => {
    if (!curId) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setCurId(null) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [curId])

  // Lời rủ xem cùng khi mình đang ở trang này (nếu app đóng thì đi qua thông báo đẩy, mở bằng /fun?together=<id>)
  useEffect(() => tg.listen((ev, p) => {
    if (!p.clip) return
    if (ev === 'invite') setInv(p.clip)
    else if (ev === 'leave') setInv(i => i === p.clip ? null : i)
  }), [tg.listen])
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('together')
    if (id) { deep.current = id; window.history.replaceState(null, '', location.pathname) }
  }, [])
  useEffect(() => { if (clips && deep.current) { const id = deep.current; deep.current = null; joinInvite(id) } }, [clips])  // eslint-disable-line react-hooks/exhaustive-deps

  async function send(text: string) {
    const t = text.trim(); if (!t || busy) return
    setBusy(true); setMsg('')
    const r = await sendClip(t, note.trim() || undefined)
    setBusy(false); setMsg(r.message)
    if (r.ok) { setLink(''); setNote(''); load() }
  }
  // Cách nhanh nhất khi không dùng được Phím tắt: bấm "Sao chép liên kết" trong TikTok, quay lại đây bấm nút này
  async function paste() {
    try {
      const t = await navigator.clipboard.readText()
      if (!hasTikTok(t)) return setMsg('Trong bộ nhớ tạm chưa có link TikTok. Bấm “Sao chép liên kết” trong TikTok trước nhé.')
      await send(t)
    } catch { setMsg('Máy không cho đọc bộ nhớ tạm. Hãy dán link vào ô bên dưới rồi bấm Gửi.') }
  }

  function open(c: Clip, joinNow = false) {
    setJoin(joinNow); setCurId(c.id)
    if (c.sender !== me.id && !c.seen_at) {
      const at = new Date().toISOString()
      ok(sb.rpc('open_clip', { cid: c.id }), 'Không đánh dấu đã xem được').then(g => { if (g) setClips(a => a && a.map(x => x.id === c.id ? { ...x, seen_at: at } : x)) })
    }
  }
  async function del(c: Clip) {
    if (!confirm('Xóa clip này khỏi danh sách của cả hai?')) return
    if (!await ok(sb.from('clips').delete().eq('id', c.id), 'Không xóa được')) return
    setClips(a => a && a.filter(x => x.id !== c.id)); setCurId(null)
  }
  const patch = useCallback((id: string, p: Partial<Clip>) => setClips(a => a && a.map(x => x.id === id ? { ...x, ...p } : x)), [])
  async function joinInvite(id: string) {
    let c = clips?.find(x => x.id === id)
    if (!c) {                                                    // clip vừa gửi mà danh sách chưa kịp có
      const r = await sb.from('clips').select('*').eq('id', id).maybeSingle()
      if (r.data) { const n = r.data as Clip; c = n; setClips(a => a && (a.some(x => x.id === id) ? a : [n, ...a])) }
    }
    if (!c) return setMsg('Không tìm thấy clip được rủ xem. Có thể đã bị xóa.')
    setInv(null); open(c, true)
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

  const newN = clips?.filter(c => c.sender !== me.id && !c.seen_at).length ?? 0
  const shown = (clips ?? []).filter(c => f === 'new' ? c.sender !== me.id && !c.seen_at : f === 'star' ? !!c.starred : true)

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
        <label className="k s"><input value={note} onChange={e => setNote(e.target.value)} maxLength={200} placeholder="Nhắn kèm cho clip (không bắt buộc)…" aria-label="Lời nhắn kèm" /></label>
        <div className="days" role="group" aria-label="Lời nhắn nhanh">{QUICK_NOTES.map(q => <button key={q} type="button" className="pill" onClick={() => setNote(q)}>{q}</button>)}</div>
        {msg && <div className="s" role="status">{msg}</div>}
      </div>

      {inv && inv !== curId && <div className="k pk" role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <b>{pn} đang rủ bạn xem cùng 👀</b>
        <div className="s" style={clamp2}>{clips?.find(c => c.id === inv)?.title ?? 'Một clip TikTok'}</div>
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="pill on" style={{ flex: 'none' }} onClick={() => joinInvite(inv)}>Tham gia</button>
          <button className="pill" style={{ flex: 'none' }} onClick={() => setInv(null)}>Để sau</button>
        </div>
      </div>}

      {clips && clips.length > 0 && <div className="tabs" role="group" aria-label="Lọc clip">
        {([['all', 'Tất cả'], ['new', newN ? `Chưa xem (${newN})` : 'Chưa xem'], ['star', '⭐ Yêu thích']] as [Filter, string][]).map(([k, l]) =>
          <button key={k} type="button" className={`pill ${f === k ? 'on' : ''}`} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>)}
      </div>}

      {err && <div className="k pe"><div className="s">{err}</div></div>}
      {clips === null && <div className="s">Đang tải…</div>}
      {clips && !clips.length && !err && <div className="k pe"><b>Chưa có clip nào</b><div className="s">Clip hai đứa gửi nhau sẽ hiện ở đây, bấm vào là xem ngay trong app.</div></div>}
      {clips && clips.length > 0 && !shown.length && <div className="k pe"><div className="s">{f === 'star' ? 'Chưa có clip yêu thích. Mở một clip rồi bấm “Yêu thích” nhé.' : 'Không còn clip nào chưa xem 🎉'}</div></div>}
      {shown.map(c => {
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
            {badges(c) && <span className="s" style={{ display: 'block' }}>{badges(c)}</span>}
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

    {cur && <ClipViewer key={cur.id} clip={cur} me={me} pn={pn} tg={tg} join={join} onClose={() => setCurId(null)} onDelete={del} onPatch={patch} />}
  </>
}
