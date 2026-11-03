'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sb } from '@/lib/supabase'
import { useApp } from '@/lib/ctx'
import { ok } from '@/lib/util'
import { VAPID, b64ToBytes } from '@/lib/push'
import Head from '@/components/Head'
import PwInput from '@/components/PwInput'
import { authMsg, pwError } from '@/lib/auth'

export default function Settings() {
  const { me, space, partner, reload } = useApp(); const r = useRouter()
  const [name, setName] = useState(me.display_name ?? ''); const [saved, setSaved] = useState(false)
  const [push, setPush] = useState<'unsupported' | 'off' | 'on' | 'denied'>('off'); const [pushMsg, setPushMsg] = useState('')
  const [email, setEmail] = useState('')
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false); const [pwMsg, setPwMsg] = useState<{ good: boolean; text: string } | null>(null)
  useEffect(() => { sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? '')) }, [])
  const save = async () => { if (await ok(sb.from('profiles').update({ display_name: name }).eq('id', me.id), 'Không lưu được tên')) { setSaved(true); reload() } }

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID) return setPush('unsupported')
    if (Notification.permission === 'denied') return setPush('denied')
    navigator.serviceWorker.getRegistration().then(reg => reg?.pushManager.getSubscription()).then(s => setPush(s ? 'on' : 'off')).catch(() => { })
  }, [])

  async function enablePush() {
    setPushMsg('')
    try {
      const reg = await navigator.serviceWorker.ready
      if (await Notification.requestPermission() !== 'granted') { setPush('denied'); return }
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID!) })
      const j = sub.toJSON()
      if (!await ok(sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: me.id, space_id: space.id, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: 'endpoint' }), 'Không lưu được đăng ký thông báo')) return
      setPush('on')
    } catch (e: any) { setPushMsg('Không bật được thông báo: ' + (e?.message ?? 'lỗi không rõ') + '. Trên iPhone cần "Thêm vào Màn hình chính" trước.') }
  }
  async function disablePush() {
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
      if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe() }
      setPush('off')
    } catch (e: any) { setPushMsg('Không tắt được thông báo: ' + (e?.message ?? '')) }
  }
  async function logout() {
    await disablePush().catch(() => { })   // máy này không còn nhận thông báo của tài khoản vừa đăng xuất
    await sb.auth.signOut({ scope: 'local' }); r.replace('/login')   // chỉ máy này; mặc định của supabase-js là đăng xuất MỌI máy
  }
  // Đổi mật khẩu (AUTH-04, SET-01): bắt nhập lại mật khẩu hiện tại cho chắc người đổi đúng là chủ tài khoản
  async function changePw() {
    setPwMsg(null)
    if (!cur) return setPwMsg({ good: false, text: 'Hãy nhập mật khẩu hiện tại' })
    const bad = pwError(pw, pw2); if (bad) return setPwMsg({ good: false, text: bad })
    if (pw === cur) return setPwMsg({ good: false, text: 'Mật khẩu mới phải khác mật khẩu hiện tại' })
    if (!email) return setPwMsg({ good: false, text: 'Chưa đọc được email tài khoản, tải lại trang rồi thử lại' })
    setPwBusy(true)
    try {
      const re = await sb.auth.signInWithPassword({ email, password: cur })
      if (re.error) throw new Error(/invalid|credentials/i.test(re.error.message + (re.error as any).code) ? 'Mật khẩu hiện tại chưa đúng' : authMsg(re.error))
      const up = await sb.auth.updateUser({ password: pw }); if (up.error) throw up.error
      await sb.auth.signOut({ scope: 'others' }).catch(() => { })   // các máy khác phải đăng nhập lại bằng mật khẩu mới
      setCur(''); setPw(''); setPw2('')
      setPwMsg({ good: true, text: 'Đã đổi mật khẩu. Các máy khác sẽ phải đăng nhập lại.' })
    } catch (e: any) { setPwMsg({ good: false, text: authMsg(e) }) }
    setPwBusy(false)
  }
  return <>
    <Head t="Cài đặt" />
    <div className="b">
      <div className="k"><b>Hồ sơ của mình</b>
        <label><input value={name} onChange={e => { setName(e.target.value); setSaved(false) }} placeholder="Tên hiển thị" /></label>
        <button className="pill" onClick={save}>{saved ? 'Đã lưu' : 'Lưu tên'}</button></div>
      <div className="k"><b>Thông báo</b>
        <div className="s">{push === 'unsupported' ? 'Máy hoặc bản cài này chưa hỗ trợ thông báo đẩy.' : push === 'denied' ? 'Bạn đã chặn thông báo. Hãy cho phép lại trong cài đặt trình duyệt.' : push === 'on' ? 'Đang bật: nhận tin nhắn, cuộc gọi và nhắc ngày đặc biệt.' : 'Nhận tin nhắn, cuộc gọi và nhắc ngày đặc biệt khi đang đóng app.'}</div>
        {push === 'off' && <button className="pill" onClick={enablePush}>Bật thông báo</button>}
        {push === 'on' && <button className="pill" onClick={disablePush}>Tắt thông báo</button>}
        {pushMsg && <div className="s" role="alert">{pushMsg}</div>}</div>
      <form className="k" style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onSubmit={e => { e.preventDefault(); changePw() }}>
        <b>Đổi mật khẩu</b>
        <input type="text" value={email} autoComplete="username" readOnly tabIndex={-1} aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
        <PwInput value={cur} onChange={setCur} placeholder="Mật khẩu hiện tại" auto="current-password" />
        <PwInput value={pw} onChange={setPw} placeholder="Mật khẩu mới (từ 8 ký tự)" auto="new-password" />
        <PwInput value={pw2} onChange={setPw2} placeholder="Nhập lại mật khẩu mới" auto="new-password" />
        {pwMsg && <div className="s" role={pwMsg.good ? 'status' : 'alert'}>{pwMsg.good ? '✓ ' : ''}{pwMsg.text}</div>}
        <button className="pill" type="submit" disabled={pwBusy} style={{ alignSelf: 'flex-start' }}>{pwBusy ? 'Đang đổi…' : 'Đổi mật khẩu'}</button>
      </form>
      <div className="k li"><b>Người ấy</b><div className="s">{partner?.display_name ?? 'Chưa vào Space'}</div></div>
      <button className="btn" onClick={logout}>Đăng xuất</button>
    </div>
  </>
}
