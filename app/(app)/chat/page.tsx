'use client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok, shrink } from '@/lib/util'
import Head from '@/components/Head'
import { notifyPartner } from '@/lib/push'

const PAGE = 50
const MAX_VIDEO = 50 * 1048576          // gói Supabase miễn phí chỉ nhận tối đa 50 MB mỗi file
const MAX_VOICE = 120                   // giây
const REACT = ['❤️', '😂', '😮', '😢', '👍']
const EMOJI = ['😀', '😂', '🥰', '😍', '😘', '😊', '🥺', '😭', '😡', '😴', '🤗', '😋', '🙈', '👍', '🙏', '💪', '❤️', '💕', '💖', '🌹', '🎉', '🍜', '☕', '🏠']
const KIND_NOTE: Record<string, string> = { image: 'Đã gửi một ảnh', video: 'Đã gửi một video', voice: 'Đã gửi một tin nhắn thoại', location: 'Đã gửi một vị trí' }
const hhmm = (s: string) => new Date(s).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
const dmy = (s: string) => new Date(s).toLocaleDateString('vi-VN')
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const snippet = (m: any) => m?.kind === 'image' ? 'Ảnh' : m?.kind === 'video' ? 'Video' : m?.kind === 'voice' ? 'Tin nhắn thoại' : m?.lat ? 'Vị trí' : String(m?.body ?? '').slice(0, 60)
const micMime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac'].find(t => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) ?? ''

export default function Chat() {
  const { me, space, partner } = useApp()
  const [msgs, set] = useState<any[]>([]); const [t, setT] = useState('')
  const [more, setMore] = useState(false); const [loadingOld, setLoadingOld] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<string | null>(null)          // tin đang chọn (hiện thả cảm xúc, trả lời)
  const [reply, setReply] = useState<any>(null)
  const [emoji, setEmoji] = useState(false); const [busy, setBusy] = useState('')
  const [typing, setTyping] = useState(false)
  const [rec, setRec] = useState<number | null>(null)          // số giây đã ghi âm, null = không ghi
  const [q, setQ] = useState(''); const [searching, setSearching] = useState(false); const [hits, setHits] = useState<any[] | null>(null)
  const box = useRef<HTMLDivElement>(null), end = useRef<HTMLDivElement>(null), file = useRef<HTMLInputElement>(null)
  const stick = useRef(true), prevH = useRef(0), tch = useRef<any>(null), lastTyping = useRef(0), typingOff = useRef<any>(null)
  const mr = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), recTick = useRef<any>(null), cancelled = useRef(false)
  const byId = (id: string) => msgs.find(m => m.id === id)

  // Phải await: query builder của Supabase chỉ gửi request khi được await/then
  const markSeen = async () => {
    const { error } = await sb.from('messages').update({ seen_at: new Date().toISOString() }).neq('sender', me.id).is('seen_at', null)
    if (error) console.error('markSeen', error.message)
  }
  // Link ảnh/video/thoại là link ký có thời hạn; ký một lượt cho các tệp chưa có link
  const sign = useCallback(async (list: any[]) => {
    const need = list.map(m => m.media_path).filter(Boolean)
    const miss = Array.from(new Set(need)).filter(p => !urls[p])
    if (!miss.length) return
    const { data } = await sb.storage.from('media').createSignedUrls(miss, 6 * 3600)
    const add: Record<string, string> = {}
    for (const x of data ?? []) if (x.path && x.signedUrl) add[x.path] = x.signedUrl
    setUrls(u => ({ ...u, ...add }))
  }, [urls])
  useEffect(() => { sign(msgs) }, [msgs, sign])

  // CHAT-03: 50 tin mới nhất, kéo lên đầu để tải thêm tin cũ
  useEffect(() => {
    sb.from('messages').select('*').order('created_at', { ascending: false }).limit(PAGE)
      .then(r => { set((r.data ?? []).reverse()); setMore((r.data?.length ?? 0) === PAGE); markSeen() })
    const ch = sb.channel('chat-' + space.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `space_id=eq.${space.id}` }, p => {
        const m: any = p.new
        if (p.eventType === 'INSERT') { if (m.sender === me.id) stick.current = true; setTyping(false) }   // tin của người kia chỉ kéo xuống khi mình đang ở cuối
        set(a => p.eventType === 'INSERT' ? (a.some(x => x.id === m.id) ? a : [...a, m]) : a.map(x => x.id === m.id ? m : x))
        if (p.eventType === 'INSERT' && m.sender !== me.id) markSeen()
      }).subscribe()
    // CHAT-07: "đang nhập" qua kênh broadcast private (cần phase5.sql)
    const tc = sb.channel('typing-' + space.id, { config: { private: true, broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, () => { setTyping(true); clearTimeout(typingOff.current); typingOff.current = setTimeout(() => setTyping(false), 4000) })
      .subscribe((s: string, e?: Error) => { if (s === 'CHANNEL_ERROR') console.warn('Kênh đang nhập lỗi (đã chạy phase5.sql chưa?)', e?.message) })
    tch.current = tc
    return () => { sb.removeChannel(ch); sb.removeChannel(tc); clearTimeout(typingOff.current) }
  }, [space.id, me.id])

  useLayoutEffect(() => {
    const el = box.current; if (!el) return
    if (prevH.current) { el.scrollTop = el.scrollHeight - prevH.current; prevH.current = 0 }   // giữ nguyên vị trí khi chèn tin cũ lên trên
    else if (stick.current) end.current?.scrollIntoView()
  }, [msgs, urls, typing])

  async function loadOlder() {
    if (loadingOld || !msgs.length) return
    setLoadingOld(true)
    const { data, error } = await sb.from('messages').select('*').lt('created_at', msgs[0].created_at).order('created_at', { ascending: false }).limit(PAGE)
    setLoadingOld(false)
    if (error) return alert('Không tải được tin cũ: ' + error.message)
    stick.current = false; prevH.current = box.current?.scrollHeight ?? 0
    set(a => [...(data ?? []).reverse().filter(m => !a.some(x => x.id === m.id)), ...a]); setMore((data?.length ?? 0) === PAGE)
  }

  // CHAT-03: tìm tin nhắn theo nội dung (chờ 0,3 giây sau khi ngừng gõ)
  useEffect(() => {
    if (!searching) return
    const k = q.trim(); if (!k) return setHits(null)
    const h = setTimeout(async () => {
      const esc = k.replace(/[\\%_]/g, c => '\\' + c)
      const { data, error } = await sb.from('messages').select('*').ilike('body', `%${esc}%`).order('created_at', { ascending: false }).limit(50)
      setHits(error ? [] : data ?? [])
    }, 300)
    return () => clearTimeout(h)
  }, [q, searching])

  // Gửi một tin; hiện ngay trên máy mình không chờ realtime (realtime sẽ không chèn trùng)
  async function post(row: any, note?: string): Promise<boolean> {
    const { data, error } = await sb.from('messages').insert({ space_id: space.id, body: '', ...row, reply_to: reply?.id ?? null }).select().single()
    if (error) { alert('Không gửi được: ' + error.message); return false }
    stick.current = true; set(a => a.some(x => x.id === data.id) ? a : [...a, data]); setReply(null)
    notifyPartner('message', note ?? KIND_NOTE[row.kind] ?? row.body)
    return true
  }
  async function send() {
    const body = t.trim(); if (!body) return
    setT(''); setEmoji(false)
    if (!await post({ body }, body)) setT(body)             // gửi lỗi thì trả lại chữ để gửi lại
  }
  const typed = (v: string) => {
    setT(v)
    if (Date.now() - lastTyping.current > 2500) { lastTyping.current = Date.now(); tch.current?.send({ type: 'broadcast', event: 'typing', payload: {} }) }
  }
  const sendLoc = () => navigator.geolocation.getCurrentPosition(
    p => { post({ kind: 'location', body: 'Vị trí của mình', lat: p.coords.latitude, lng: p.coords.longitude }) },
    () => alert('Không lấy được vị trí. Hãy cho phép truy cập vị trí.'), { enableHighAccuracy: true })

  // CHAT-02: gửi ảnh (nén trước khi tải) và video ngắn
  async function sendFiles(list: FileList | null) {
    const files = Array.from(list ?? []).slice(0, 5); if (file.current) file.current.value = ''
    for (const f of files) {
      try {
        setBusy(`Đang gửi ${f.name}…`)
        const vid = f.type.startsWith('video/')
        if (!vid && !f.type.startsWith('image/')) { alert(`${f.name}: chỉ gửi được ảnh hoặc video`); continue }
        if (vid && f.size > MAX_VIDEO) { alert(`${f.name}: video lớn hơn 50 MB (giới hạn của gói Supabase miễn phí)`); continue }
        const path = `${space.id}/${crypto.randomUUID()}.${vid ? (f.name.split('.').pop() || 'mp4').toLowerCase() : 'jpg'}`
        const { error } = await sb.storage.from('media').upload(path, vid ? f : await shrink(f), { contentType: vid ? f.type : 'image/jpeg' })
        if (error) { alert(`Không tải ${f.name} lên được: ${error.message}`); continue }
        if (!await post({ kind: vid ? 'video' : 'image', media_path: path })) { await sb.storage.from('media').remove([path]); break }
      } catch (e: any) { alert(`${f.name}: ${e?.message ?? 'không xử lý được tệp'}`) }
    }
    setBusy('')
  }

  // CHAT-06: tin nhắn thoại, bấm để bắt đầu ghi, bấm lần nữa để gửi (tối đa 2 phút)
  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return alert('Trình duyệt này chưa hỗ trợ ghi âm.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = micMime(), r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      chunks.current = []; cancelled.current = false; mr.current = r
      r.ondataavailable = e => { if (e.data.size) chunks.current.push(e.data) }
      const t0 = Date.now()
      r.onstop = async () => {
        stream.getTracks().forEach(x => x.stop()); clearInterval(recTick.current); setRec(null)
        const secs = Math.max(1, Math.round((Date.now() - t0) / 1000))
        if (cancelled.current || !chunks.current.length) return
        const type = r.mimeType || mime || 'audio/webm', ext = type.includes('mp4') || type.includes('aac') ? 'm4a' : 'webm'
        const path = `${space.id}/${crypto.randomUUID()}.${ext}`
        setBusy('Đang gửi tin nhắn thoại…')
        const { error } = await sb.storage.from('media').upload(path, new Blob(chunks.current, { type }), { contentType: type })
        if (error) alert('Không tải tin nhắn thoại lên được: ' + error.message)
        else if (!await post({ kind: 'voice', media_path: path, duration: secs })) await sb.storage.from('media').remove([path])
        setBusy('')
      }
      r.start(); setRec(0)
      recTick.current = setInterval(() => setRec(s => { const n = (s ?? 0) + 1; if (n >= MAX_VOICE) r.state === 'recording' && r.stop(); return n }), 1000)
    } catch { alert('Không mở được micro. Hãy cho phép quyền truy cập micro trong trình duyệt (và mở app bằng https).') }
  }
  const stopRec = (cancel = false) => { cancelled.current = cancel; if (mr.current?.state === 'recording') mr.current.stop() }
  useEffect(() => () => { cancelled.current = true; clearInterval(recTick.current); if (mr.current?.state === 'recording') mr.current.stop() }, [])

  // CHAT-05: thả/bỏ cảm xúc (một lệnh trên server, hai người thả cùng lúc không ghi đè nhau)
  async function react(m: any, e: string) {
    if (await ok(sb.rpc('react', { p_msg: m.id, p_emoji: e }), 'Không thả được cảm xúc')) setSel(null)
  }
  const call = (video: boolean) => window.dispatchEvent(new CustomEvent('tdlove-call', { detail: { video } }))
  const lastMine = [...msgs].reverse().find(m => m.sender === me.id)
  const pn = partner?.display_name ?? 'Người ấy'

  function body(m: any) {
    const u = m.media_path ? urls[m.media_path] : undefined
    if (m.kind === 'image') return u ? <a href={u} target="_blank" rel="noreferrer"><img src={u} alt="Ảnh trong tin nhắn" loading="lazy" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 14 }} /></a> : <span className="s">Đang tải ảnh…</span>
    if (m.kind === 'video') return u ? <video src={u} controls playsInline preload="metadata" style={{ display: 'block', maxWidth: '100%', maxHeight: 320, borderRadius: 14 }} /> : <span className="s">Đang tải video…</span>
    if (m.kind === 'voice') return u ? <div><audio src={u} controls preload="metadata" style={{ width: '100%', minWidth: 200 }} /><div className="s">Tin nhắn thoại {m.duration ? clock(m.duration) : ''}</div></div> : <span className="s">Đang tải tin nhắn thoại…</span>
    if (m.lat) return <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer"><b>Vị trí của mình</b> <span className="s">Mở trên bản đồ</span></a>
    return <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.body}</span>
  }
  function chips(m: any) {
    const c: Record<string, string[]> = {}
    for (const [uid, e] of Object.entries<string>(m.reactions ?? {})) (c[e] ??= []).push(uid)
    const k = Object.keys(c); if (!k.length) return null
    return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{k.map(e =>
      <button key={e} className={`pill ${c[e].includes(me.id) ? 'on' : ''}`} style={{ padding: '2px 10px' }} onClick={() => react(m, e)} aria-label={`Cảm xúc ${e}, ${c[e].length} người`}>{e}{c[e].length > 1 ? ` ${c[e].length}` : ''}</button>)}</div>
  }

  return <>
    <Head t={pn}><button className="pill" onClick={() => { setSearching(s => !s); setQ(''); setHits(null) }}>{searching ? 'Đóng' : 'Tìm'}</button><button className="pill" onClick={() => call(false)}>Gọi</button><button className="pill" onClick={() => call(true)}>Video</button></Head>
    {searching && <div style={{ padding: '0 18px 8px' }}>
      <label className="k s"><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm trong tin nhắn…" aria-label="Tìm tin nhắn" /></label>
    </div>}
    <div className="b" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120 }}>
      {searching ? <>
        {hits && !hits.length && <div className="k pe"><div className="s">Không thấy tin nhắn nào có “{q.trim()}”.</div></div>}
        {!hits && <div className="s">Gõ từ khóa để tìm trong toàn bộ tin nhắn.</div>}
        {hits?.map(m => <div key={m.id} className={`k ${m.sender === me.id ? 'pk' : ''}`}><div className="s">{m.sender === me.id ? 'Bạn' : pn}, {dmy(m.created_at)} {hhmm(m.created_at)}</div>{m.body}</div>)}
      </> : <>
        {more && <button className="pill" style={{ alignSelf: 'center', flex: 'none' }} onClick={loadOlder} disabled={loadingOld}>{loadingOld ? 'Đang tải…' : 'Tải tin cũ hơn'}</button>}
        {!msgs.length && <div className="k pe"><b>Chưa có tin nhắn</b><div className="s">Nhắn lời đầu tiên cho người ấy nhé.</div></div>}
        {msgs.map((m, i) => {
          const mine = m.sender === me.id, orig = m.reply_to ? byId(m.reply_to) : null
          const newDay = i === 0 || dmy(msgs[i - 1].created_at) !== dmy(m.created_at)
          return <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 'none' }}>
            {newDay && <div className="s" style={{ textAlign: 'center' }}>{dmy(m.created_at)}</div>}
            <div className={`k ${mine ? 'pk me' : 'you'}`} style={sel === m.id ? { outline: '3px solid var(--ink2)' } : undefined}>
              {m.reply_to && <div className="s" style={{ borderLeft: '3px solid var(--ink2)', paddingLeft: 8, marginBottom: 6 }}>{orig ? `${orig.sender === me.id ? 'Bạn' : pn}: ${snippet(orig)}` : 'Trả lời một tin trước đó'}</div>}
              <div role="button" tabIndex={0} aria-label="Chọn tin nhắn để trả lời hoặc thả cảm xúc" style={{ cursor: 'pointer' }}
                onClick={e => { if ((e.target as HTMLElement).closest('a,audio,video,button')) return; setSel(sel === m.id ? null : m.id) }}
                onKeyDown={e => { if (e.key === 'Enter') setSel(sel === m.id ? null : m.id) }}>{body(m)}</div>
              <div className="s" style={{ fontSize: 14, marginTop: 4, textAlign: mine ? 'right' : 'left' }}>{hhmm(m.created_at)}</div>
              {chips(m)}
              {sel === m.id && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {REACT.map(e => <button key={e} className={`pill ${m.reactions?.[me.id] === e ? 'on' : ''}`} onClick={() => react(m, e)} aria-label={`Thả ${e}`}>{e}</button>)}
                <button className="pill" onClick={() => { setReply(m); setSel(null) }}>Trả lời</button>
              </div>}
            </div>
          </div>
        })}
        {lastMine && <div className="s" style={{ textAlign: 'right', flex: 'none' }}>{lastMine.seen_at ? 'Đã xem' : 'Đã gửi'}</div>}
        {typing && <div className="s" role="status" style={{ flex: 'none' }}>{pn} đang nhập…</div>}
        <div ref={end} />
      </>}
    </div>
    <div style={{ padding: '0 18px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      {busy && <div className="s" role="status">{busy}</div>}
      {reply && <div className="k li s" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ flex: 1 }}>Trả lời {reply.sender === me.id ? 'chính mình' : pn}: {snippet(reply)}</span><button className="pill" onClick={() => setReply(null)} aria-label="Hủy trả lời">×</button></div>}
      {emoji && <div className="k" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{EMOJI.map(e => <button key={e} className="pill" style={{ border: 0, fontSize: 24, padding: '2px 6px' }} onClick={() => setT(v => v + e)} aria-label={`Chèn ${e}`}>{e}</button>)}</div>}
      {rec !== null ? <div className="row">
        <div className="k s" role="status" style={{ flex: 1 }}>● Đang ghi âm {clock(rec)} / {clock(MAX_VOICE)}</div>
        <button className="pill" style={{ flex: 'none' }} onClick={() => stopRec(true)}>Hủy</button>
        <button className="btn" style={{ flex: 'none', width: 'auto', padding: '11px 22px' }} onClick={() => stopRec(false)}>Gửi</button>
      </div> : <>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <label className="pill">Ảnh/Video<input ref={file} type="file" accept="image/*,video/*" multiple hidden onChange={e => sendFiles(e.target.files)} /></label>
          <button className="pill" onClick={startRec}>Ghi âm</button>
          <button className="pill" onClick={sendLoc}>Vị trí</button>
          <button className={`pill ${emoji ? 'on' : ''}`} onClick={() => setEmoji(v => !v)} aria-label="Chọn emoji">😊</button>
        </div>
        <div className="row">
          <label className="k s"><input value={t} onChange={e => typed(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Nhắn gì đó cho người ấy…" aria-label="Nội dung tin nhắn" /></label>
          <button className="rb" onClick={send}>Gửi</button>
        </div>
      </>}
    </div>
  </>
}
