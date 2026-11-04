'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart } from '@/components/Head'
import { getLock, leaveDevice, verifyBio, verifyPin } from '@/lib/applock'

// Màn hình khóa (AUTH-06): bàn phím số to dễ bấm một tay, tự gửi khi nhập đủ số, hỗ trợ cả bàn phím máy tính
export default function Lock({ uid, onUnlock }: { uid: string; onUnlock: () => void }) {
  const r = useRouter()
  const cfg = getLock(uid)!
  const [pin, setPin] = useState(''); const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)   // giây còn phải chờ sau khi nhập sai nhiều lần
  const root = useRef<HTMLDivElement>(null)

  const leave = useCallback(async (why: string) => { await leaveDevice(uid); alert(why); r.replace('/login') }, [uid, r])
  async function submit(p: string) {
    setBusy(true)
    const res = await verifyPin(uid, p)
    if (res.state === 'ok') return onUnlock()
    setPin(''); setBusy(false)
    if (res.state === 'wipe') return leave('Bạn nhập sai PIN quá nhiều lần nên mình đã đăng xuất khỏi máy này. Hãy đăng nhập lại bằng mật khẩu, rồi đặt PIN mới.')
    if (res.waitMs) setWait(Math.ceil(res.waitMs / 1000))
    setMsg(res.state === 'wait' ? '' : `PIN chưa đúng, còn ${res.left} lần thử${res.left <= 3 ? ' (hết lượt sẽ đăng xuất khỏi máy này)' : ''}`)
  }
  const add = (d: string) => {
    if (busy || wait > 0) return
    const next = (pin + d).slice(0, cfg.len); setPin(next); setMsg('')
    if (next.length === cfg.len) submit(next)
  }
  const del = () => { if (!busy) setPin(p => p.slice(0, -1)) }

  async function bio(silent = false) {
    if (!cfg.bio || busy) return
    try { if (await verifyBio(uid)) onUnlock(); else if (!silent) setMsg('Chưa xác nhận được, hãy nhập PIN nhé') }
    catch { if (!silent) setMsg('Không dùng được sinh trắc học lúc này, hãy nhập PIN nhé') }   // bấm hủy cũng rơi vào đây
  }
  useEffect(() => { if (cfg.bio && document.visibilityState === 'visible') bio(true) }, [])   // Chrome Android cho tự hiện; iOS cần bấm nút nên bỏ qua im lặng
  useEffect(() => { root.current?.focus() }, [])
  useEffect(() => { if (wait > 0) { const t = setTimeout(() => setWait(w => w - 1), 1000); return () => clearTimeout(t) } }, [wait])
  useEffect(() => {   // đang bị chờ từ lần mở trước thì vẫn phải chờ nốt
    const left = cfg.until - Date.now(); if (left > 0) setWait(Math.ceil(left / 1000))
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (/^\d$/.test(e.key)) add(e.key); else if (e.key === 'Backspace') del() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })

  const forgot = () => { if (confirm('Quên PIN? Mình sẽ đăng xuất khỏi máy này, bạn đăng nhập lại bằng mật khẩu rồi đặt PIN mới.')) leave('Đã đăng xuất khỏi máy này. Hãy đăng nhập lại bằng mật khẩu.') }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  return <div className="p" style={{ position: 'fixed', left: 0, right: 0, top: 0, zIndex: 1500 }} role="dialog" aria-modal="true" aria-label="Nhập PIN để mở app">
    <div className="b" ref={root} tabIndex={-1} style={{ justifyContent: 'center', alignItems: 'center', outline: 'none' }}>
      <Heart size={84} />
      <h1 className="num" style={{ fontSize: 30, textAlign: 'center' }}>tdlove đang khóa</h1>
      <div className="s" style={{ textAlign: 'center' }}>Nhập PIN để mở</div>
      <div className="dots" role="img" aria-label={`Đã nhập ${pin.length} trên ${cfg.len} số`}>{Array.from({ length: cfg.len }, (_, i) => <i key={i} className={i < pin.length ? 'f' : ''} />)}</div>
      <div className="s" role="alert" style={{ textAlign: 'center', minHeight: 24 }}>{wait > 0 ? `Nhập sai nhiều lần, thử lại sau ${wait} giây` : msg}</div>
      <div className="pad">
        {keys.map(d => <button key={d} onClick={() => add(d)} disabled={busy || wait > 0} aria-label={d}>{d}</button>)}
        {cfg.bio ? <button className="sm" onClick={() => bio()} disabled={busy} aria-label="Mở bằng sinh trắc học">Vân tay / Face ID</button> : <span />}
        <button onClick={() => add('0')} disabled={busy || wait > 0} aria-label="0">0</button>
        <button className="sm" onClick={del} disabled={busy || !pin} aria-label="Xóa số vừa nhập">Xóa</button>
      </div>
      <button className="pill" onClick={forgot}>Quên PIN?</button>
    </div>
  </div>
}
