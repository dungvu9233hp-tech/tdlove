'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { ok } from '@/lib/util'
import { notifyPartner } from '@/lib/push'
import { clamp2, dmy, embedSrc, hhmm, REACTS, type Clip, type Comment } from '@/lib/clips'
import type { Together } from '@/lib/together'

type Props = {
  clip: Clip; me: any; pn: string; tg: Together
  join?: boolean                                   // mở từ lời rủ: vào thẳng phòng xem cùng
  onClose: () => void
  onDelete: (c: Clip) => void
  onPatch: (id: string, p: Partial<Clip>) => void  // cập nhật ngay trên máy mình, realtime lo phần máy kia
}
type Play = { playing: boolean; time: number }
const fresh = () => ({ t: 0, at: 0, playing: false, ready: false, guard: 0, pending: null as Play | null })

// Xem một clip: trình phát nhúng của TikTok, thả cảm xúc, yêu thích, bình luận và "Xem cùng nhau".
// Xem cùng nhau: hai máy mở cùng clip, ai bấm phát/tạm dừng/tua thì máy kia theo (điều khiển trình phát qua postMessage chính thức của TikTok).
export default function ClipViewer({ clip, me, pn, tg, join, onClose, onDelete, onPatch }: Props) {
  const { on: tgOn, send, listen } = tg
  const mine = clip.sender === me.id
  const fr = useRef<HTMLIFrameElement>(null)
  const st = useRef(fresh())
  const role = useRef<'host' | 'guest'>(join ? 'guest' : 'host')
  const announced = useRef(false), lastInvite = useRef(0)
  const [tog, setTog] = useState(!!join)                // đang ở trong phòng xem cùng
  const [inv, setInv] = useState(false)                 // người kia đang rủ xem clip này
  const [pin, setPin] = useState(false)                 // người kia đang ở trong phòng
  const pinRef = useRef(false), lastSeen = useRef(0)
  const [hint, setHint] = useState('')
  const [flies, setFlies] = useState<{ id: number; e: string; x: number }[]>([])
  const fid = useRef(0)
  const [cm, setCm] = useState<Comment[] | null>(null)
  const [cerr, setCerr] = useState('')
  const [ct, setCt] = useState(''); const [cbusy, setCbusy] = useState(false)

  const myReact = clip.reactions?.[me.id]
  const partnerReact = Object.entries(clip.reactions ?? {}).find(([u]) => u !== me.id)?.[1]

  const post = useCallback((type: string, value?: number) => {
    fr.current?.contentWindow?.postMessage({ type, value, 'x-tiktok-player': true }, '*')
  }, [])
  const seen = useCallback(() => { lastSeen.current = Date.now(); if (!pinRef.current) { pinRef.current = true; setPin(true) } }, [])
  const flyOne = useCallback((e: string) => {
    const id = ++fid.current
    setFlies(a => [...a.slice(-11), { id, e, x: 10 + Math.random() * 72 }])
    setTimeout(() => setFlies(a => a.filter(f => f.id !== id)), 2300)
  }, [])

  // Áp trạng thái của người kia lên trình phát của mình. `guard` để những sự kiện do chính lệnh này gây ra không bị gửi ngược lại.
  const apply = useCallback((s: Play) => {
    const x = st.current
    if (!x.ready) { x.pending = s; return }
    x.guard = Date.now() + 1500
    if (Math.abs(x.t - s.time) > 1.2) post('seekTo', s.time)
    post(s.playing ? 'play' : 'pause')
    x.playing = s.playing; x.t = s.time; x.at = Date.now()
  }, [post])
  const mineState = useCallback(() => ({ clip: clip.id, playing: st.current.playing, time: st.current.t }), [clip.id])

  function start(r: 'host' | 'guest') { role.current = r; setInv(false); setHint(''); setTog(true) }
  function stop() { setTog(false); setPin(false); pinRef.current = false; setHint('') }

  // Vào/ra phòng: làm mới trạng thái trình phát, báo cho người kia (người rủ thì kèm thông báo đẩy, chỉ một lần)
  useEffect(() => { st.current = fresh() }, [tog, clip.id])
  useEffect(() => {
    if (!tog) { announced.current = false; return }
    if (!tgOn || announced.current) return
    announced.current = true
    if (role.current === 'host') {
      send('invite', { clip: clip.id })
      if (Date.now() - lastInvite.current > 60000) { lastInvite.current = Date.now(); notifyPartner('together', undefined, clip.id) }   // bấm ra vào liên tục thì không báo đẩy lặp lại
    }
    else send('join', { clip: clip.id })
  }, [tog, tgOn, clip.id, send])
  useEffect(() => { if (!tog) return; const id = clip.id; return () => send('leave', { clip: id }) }, [tog, clip.id, send])

  // Nhịp "còn ở đây" mỗi 8 giây; quá 22 giây không nghe gì từ người kia thì coi như họ đã rời
  useEffect(() => {
    if (!tog || !tgOn) return
    const i = setInterval(() => {
      send('ping', { clip: clip.id })
      if (pinRef.current && Date.now() - lastSeen.current > 22000) { pinRef.current = false; setPin(false) }
    }, 8000)
    return () => clearInterval(i)
  }, [tog, tgOn, clip.id, send])

  // Tin từ người kia
  useEffect(() => listen((ev, p) => {
    if (p.clip !== clip.id) return
    if (ev === 'invite') {
      if (!tog) return setInv(true)
      seen(); send('join', { clip: clip.id }); return        // cả hai cùng bấm rủ: coi như người kia vừa vào phòng
    }
    if (ev === 'leave') { setInv(false); if (tog) { pinRef.current = false; setPin(false) } return }
    if (!tog) return
    if (ev === 'join') { seen(); send('state', mineState()) }
    else if (ev === 'state') { seen(); apply({ playing: !!p.playing, time: p.time ?? 0 }) }
    // Gặp lại người kia sau khi họ bị coi là đã rời: chỉ người rủ (chủ phòng) kéo họ về chỗ mình, để người mới vào không ghi đè clip đang phát
    else if (ev === 'ping') { const first = !pinRef.current; seen(); if (first && role.current === 'host') send('state', mineState()) }
    else if (ev === 'fly' && p.emoji) { seen(); flyOne(p.emoji) }
  }), [listen, send, tog, clip.id, seen, apply, mineState, flyOne])

  // Tin từ trình phát của TikTok: phát/tạm dừng/tua của mình thì báo cho người kia
  useEffect(() => {
    if (!tog) return
    const h = (e: MessageEvent) => {
      if (e.source !== fr.current?.contentWindow) return
      let d: any = e.data
      if (typeof d === 'string') { try { d = JSON.parse(d) } catch { return } }
      if (!d || !d['x-tiktok-player']) return
      const x = st.current, now = Date.now(), v = d.value
      if (!x.ready && d.type !== 'onPlayerError') {            // thấy trình phát nói gì đó là coi như đã sẵn sàng
        x.ready = true
        if (x.pending) { const p = x.pending; x.pending = null; apply(p) }
      }
      if (d.type === 'onStateChange') {
        if (v === 3 || v === -1) return                         // đang tải / mới khởi tạo
        x.playing = v === 1; x.at = now
        if (now > x.guard) send('state', mineState())
      } else if (d.type === 'onCurrentTime') {
        const t = typeof v === 'number' ? v : v?.currentTime
        if (typeof t !== 'number') return
        const expect = x.t + (x.playing ? (now - x.at) / 1000 : 0)
        const jumped = Math.abs(t - expect) > 2                 // nhảy xa hơn thời gian trôi tự nhiên: là người xem vừa tua
        x.t = t; x.at = now
        if (jumped && now > x.guard) send('state', { clip: clip.id, playing: x.playing, time: t })
      } else if (d.type === 'onPlayerError') {
        const c = v?.errorCode ?? d.errorCode
        setHint(c === 3002 ? 'Máy chặn tự phát. Chạm vào video để phát.' : c === 1001 ? 'Clip này không phát được (đã xóa hoặc đặt riêng tư). Thử “Mở trong TikTok”.' : 'Trình phát gặp lỗi. Thử “Mở trong TikTok”.')
      }
    }
    window.addEventListener('message', h)
    return () => window.removeEventListener('message', h)
  }, [tog, clip.id, send, apply, mineState])

  // Người kia thả cảm xúc khi mình đang xem một mình: cho bay lên một cái (khi xem cùng thì đã có tin "fly")
  const prevPR = useRef(partnerReact)
  useEffect(() => { if (!tog && partnerReact && partnerReact !== prevPR.current) flyOne(partnerReact); prevPR.current = partnerReact }, [partnerReact, tog, flyOne])

  // Bình luận: tải một lần rồi nghe realtime
  useEffect(() => {
    let off = false
    setCm(null); setCerr('')
    sb.from('clip_comments').select('id,clip_id,author,body,created_at').eq('clip_id', clip.id).order('created_at').limit(200).then(r => {
      if (off) return
      if (r.error) { setCerr('Chưa tải được bình luận. Đã chạy supabase/phase14.sql chưa?'); setCm([]) } else setCm(r.data as Comment[])
    })
    const ch = sb.channel('cc-' + clip.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clip_comments', filter: `clip_id=eq.${clip.id}` },
        p => setCm(a => { const n = p.new as Comment; return !a || a.some(x => x.id === n.id) ? a : [...a, n] }))
      // DELETE không lọc được; chỉ mang theo id nên id lạ sẽ không làm gì
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clip_comments' },
        p => setCm(a => { const o: any = p.old; return a && a.filter(x => x.id !== o.id) }))
      .subscribe()
    return () => { off = true; sb.removeChannel(ch) }
  }, [clip.id])

  async function react(e: string) {
    const old = clip.reactions ?? {}, had = old[me.id] === e
    const next = { ...old }; if (had) delete next[me.id]; else next[me.id] = e
    onPatch(clip.id, { reactions: next })
    if (!await ok(sb.rpc('react_clip', { p_clip: clip.id, p_emoji: e }), 'Không thả được cảm xúc')) return onPatch(clip.id, { reactions: old })
    if (had) return
    flyOne(e)
    if (tog && pin) send('fly', { clip: clip.id, emoji: e })     // người kia đang xem cùng thì thấy ngay, khỏi báo đẩy
    else if (!mine) notifyPartner('clip-react', `${e} ${clip.title ? '“' + clip.title.slice(0, 50) + '”' : ''}`.trim())
  }
  async function star() {
    const was = !!clip.starred
    onPatch(clip.id, { starred: !was })
    if (!await ok(sb.rpc('star_clip', { p_clip: clip.id, p_on: !was }), 'Không đánh dấu được')) onPatch(clip.id, { starred: was })
  }
  async function addComment() {
    const body = ct.trim(); if (!body || cbusy) return
    setCbusy(true)
    const r = await sb.from('clip_comments').insert({ clip_id: clip.id, space_id: clip.space_id, author: me.id, body }).select('id,clip_id,author,body,created_at').single()
    setCbusy(false)
    if (r.error) return alert('Không gửi được bình luận: ' + r.error.message)
    setCt(''); setCm(a => a && (a.some(x => x.id === r.data.id) ? a : [...a, r.data as Comment]))
    if (!(tog && pin)) notifyPartner('clip-comment', body.slice(0, 80))
  }
  async function delComment(c: Comment) {
    if (!await ok(sb.from('clip_comments').delete().eq('id', c.id), 'Không xóa được bình luận')) return
    setCm(a => a && a.filter(x => x.id !== c.id))
  }

  const status = !tgOn ? 'Đang kết nối… (nếu mãi không được, kiểm tra đã chạy supabase/phase14.sql chưa)'
    : pin ? `${pn} đang xem cùng bạn 💞`
    : role.current === 'host' ? `Đã rủ ${pn}. Đang chờ ${pn} vào…` : `Chưa thấy ${pn} trong phòng`

  return <div className="sheet" role="dialog" aria-modal="true" aria-label="Xem clip">
    <div className="row"><b style={{ ...clamp2, flex: 1 }}>{clip.title ?? 'Clip TikTok'}</b><button className="pill" style={{ flex: 'none' }} onClick={onClose}>Đóng</button></div>

    <div className="vwrap">
      <iframe key={`${clip.id}:${tog ? 'tg' : 'solo'}`} ref={fr} src={embedSrc(clip.video_id, !tog)} title="Clip TikTok" allow="autoplay; fullscreen; encrypted-media"
        style={{ width: '100%', height: 'min(62dvh, 600px)', display: 'block', border: '2.5px solid var(--ink)', borderRadius: 22, background: '#000' }} />
      <div className="flies" aria-hidden="true">{flies.map(f => <span key={f.id} className="fly" style={{ left: f.x + '%' }}>{f.e}</span>)}</div>
    </div>
    {hint && <div className="s" role="status">{hint}</div>}

    <div className="tabs" role="group" aria-label="Thả cảm xúc">
      {REACTS.map(e => <button key={e} type="button" className={`pill ${myReact === e ? 'on' : ''}`} style={{ fontSize: 22, padding: '2px 0' }} aria-pressed={myReact === e} aria-label={`Thả ${e}`} onClick={() => react(e)}>{e}</button>)}
    </div>
    {partnerReact && <div className="s" role="status">{pn} đã thả {partnerReact}{myReact && ' · hai đứa cùng thích 💞'}</div>}

    <div className="k li" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {!tog ? <>
        {inv ? <><b>{pn} đang rủ bạn xem cùng clip này</b><button className="btn" onClick={() => start('guest')}>Tham gia ngay</button></>
          : <><b>Xem cùng nhau</b><div className="s">Hai máy cùng mở clip này. Ai bấm phát, tạm dừng hay tua thì máy kia theo, thả cảm xúc bay lên cho nhau thấy.</div>
            <button className="btn" onClick={() => start('host')}>👀 Rủ {pn} xem cùng</button></>}
      </> : <>
        <b>Đang xem cùng nhau</b>
        <div className="s" role="status">{status}</div>
        {pin && <div className="s">Bấm phát ở video, máy {pn} sẽ phát theo.</div>}
        <div className="row" style={{ justifyContent: 'flex-start' }}>
          <button className="pill" style={{ flex: 'none' }} disabled={!pin} onClick={() => send('state', mineState())}>Kéo {pn} về chỗ mình</button>
          <button className="pill" style={{ flex: 'none' }} onClick={stop}>Rời phòng</button>
        </div>
      </>}
    </div>

    <div className="s">{mine ? 'Bạn' : pn} gửi lúc {hhmm(clip.created_at)}, {dmy(clip.created_at)}{clip.author_name ? ` · @${clip.author_name}` : ''}</div>
    {clip.note && <div className="k pk"><span className="s">“{clip.note}”</span></div>}
    <div className="row" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
      <button className={`pill ${clip.starred ? 'on' : ''}`} style={{ flex: 'none' }} aria-pressed={!!clip.starred} onClick={star}>{clip.starred ? '⭐ Đã yêu thích' : '☆ Yêu thích'}</button>
      <a className="pill" style={{ flex: 'none' }} href={clip.url} target="_blank" rel="noopener noreferrer">Mở trong TikTok</a>
      <button className="pill" style={{ flex: 'none' }} onClick={() => onDelete(clip)}>Xóa</button>
    </div>

    <b>Bình luận{cm?.length ? ` (${cm.length})` : ''}</b>
    {cerr && <div className="s">{cerr}</div>}
    {cm === null && <div className="s">Đang tải…</div>}
    {cm && !cm.length && !cerr && <div className="s">Chưa có bình luận. Nhắn gì đó cho {pn} nhé.</div>}
    {cm?.map(c => {
      const own = c.author === me.id
      return <div key={c.id} className={`k ${own ? 'pk me' : 'li you'}`} style={{ flex: 'none' }}>
        <div className="s" style={{ fontSize: 14 }}>{own ? 'Bạn' : pn} · {hhmm(c.created_at)} {dmy(c.created_at)}</div>
        <div style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{c.body}</div>
        {own && <button type="button" className="pill" style={{ marginTop: 6, fontSize: 14, padding: '1px 10px' }} onClick={() => delComment(c)} aria-label="Xóa bình luận của bạn">Xóa</button>}
      </div>
    })}
    <div className="row" style={{ flex: 'none' }}>
      <label className="k s"><input value={ct} onChange={e => setCt(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} maxLength={300} placeholder={`Nhắn gì đó về clip này…`} aria-label="Viết bình luận" /></label>
      <button className="rb" onClick={addComment} disabled={cbusy || !ct.trim()}>Gửi</button>
    </div>
  </div>
}
