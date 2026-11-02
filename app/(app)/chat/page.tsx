'use client'
import { useEffect, useRef, useState } from 'react'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import Head from '@/components/Head'
import { notifyPartner } from '@/lib/push'

export default function Chat() {
  const { me, space, partner } = useApp()
  const [msgs, set] = useState<any[]>([]); const [t, setT] = useState('')
  const end = useRef<HTMLDivElement>(null)
  // Phải await: query builder của Supabase chỉ gửi request khi được await/then
  const markSeen = async () => {
    const { error } = await sb.from('messages').update({ seen_at: new Date().toISOString() }).neq('sender', me.id).is('seen_at', null)
    if (error) console.error('markSeen', error.message)
  }

  useEffect(() => {
    sb.from('messages').select('*').order('created_at', { ascending: false }).limit(50)
      .then(r => { set((r.data ?? []).reverse()); markSeen() })
    const ch = sb.channel('chat-' + space.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `space_id=eq.${space.id}` }, p => {
        const m: any = p.new
        set(a => p.eventType === 'INSERT' ? (a.some(x => x.id === m.id) ? a : [...a, m]) : a.map(x => x.id === m.id ? m : x))
        if (p.eventType === 'INSERT' && m.sender !== me.id) markSeen()
      }).subscribe()
    return () => { sb.removeChannel(ch) }
  }, [space.id, me.id])
  useEffect(() => { end.current?.scrollIntoView() }, [msgs])

  const call = (video: boolean) => window.dispatchEvent(new CustomEvent('tdlove-call', { detail: { video } }))
  const sendLoc = () => navigator.geolocation.getCurrentPosition(async p => {
    const { error } = await sb.from('messages').insert({ space_id: space.id, body: 'Vị trí của mình', lat: p.coords.latitude, lng: p.coords.longitude })
    if (error) alert('Không gửi được vị trí: ' + error.message); else notifyPartner('message', 'Đã gửi một vị trí')
  }, () => alert('Không lấy được vị trí. Hãy cho phép truy cập vị trí.'), { enableHighAccuracy: true })
  async function send() {
    const body = t.trim(); if (!body) return
    setT('')
    const { error } = await sb.from('messages').insert({ space_id: space.id, body })
    if (error) { setT(body); return alert('Không gửi được tin nhắn: ' + error.message) }   // trả lại nội dung để gửi lại
    notifyPartner('message', body)
  }
  const lastMine = [...msgs].reverse().find(m => m.sender === me.id)

  return <>
    <Head t={partner?.display_name ?? 'Người ấy'}><button className="pill" onClick={() => call(false)}>Gọi</button><button className="pill" onClick={() => call(true)}>Video</button></Head>
    <div className="b">
      {!msgs.length && <div className="k pe"><b>Chưa có tin nhắn</b><div className="s">Nhắn lời đầu tiên cho người ấy nhé.</div></div>}
      {msgs.map(m => <div key={m.id} className={`k ${m.sender === me.id ? 'pk me' : 'you'}`}>{m.lat ? <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noreferrer"><b>Vị trí của mình</b><span className="s">Mở trên bản đồ</span></a> : m.body}</div>)}
      {lastMine?.seen_at && <div className="s" style={{ textAlign: 'right' }}>Đã xem</div>}
      <div ref={end} />
    </div>
    <div className="row" style={{ padding: '0 18px 12px' }}>
      <label className="k s"><input value={t} onChange={e => setT(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Nhắn gì đó cho người ấy…" /></label>
      <button className="rb" onClick={sendLoc} aria-label="Gửi vị trí">Vị trí</button><button className="rb" onClick={send}>Gửi</button>
    </div>
  </>
}
